import { useState } from 'react'
import type { FormEvent } from 'react'
import { Bot, CheckCircle2, CornerDownLeft, LoaderCircle, MessageCircle, Sparkles, UserRound } from 'lucide-react'

type Kind = 'expense' | 'income'
type Person = 'Agus' | 'Camila' | 'Compartido'
type Category = { id: string; name: string; kind: Kind }
type KnowledgeEntry = { phrase: string; normalized_phrase: string; movement_type: Kind; category_name: string; canonical_concept: string; match_type: 'phrase' | 'merchant'; priority: number }
type Draft = { date: string; kind: Kind; concept: string; category: string; person: Person; amount: number; comment?: string }
type PendingDraft = Omit<Draft, 'category'>
type CategoryChoice = { label: string; category: string }
type Message = { role: 'user' | 'assistant'; text: string; draft?: Draft; pendingDraft?: PendingDraft; choices?: CategoryChoice[] }
type ParseResult =
  | { status: 'ready'; draft: Draft }
  | { status: 'clarify'; text: string; pendingDraft: PendingDraft; choices: CategoryChoice[] }
  | { status: 'unknown' }

const today = () => new Date().toLocaleDateString('en-CA')
const normalize = (value: string) => value.toLocaleLowerCase('es-AR').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
const hasTerm = (text: string, term: string) => term.endsWith('%') ? new RegExp(`(^|[^a-z0-9])${term.slice(0, -1)}%?($|[^a-z0-9])`).test(text) : new RegExp(`(^|[^a-z0-9])${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9])`).test(text)

function parseAmount(text: string): number | null {
  const clean = normalize(text)

  // Expresiones habituales en Argentina: "medio palo", "dos gambas", "15 lucas".
  if (/\bmedio\s+(palo|millon)\b/.test(clean)) return 500000
  if (/\bmedia\s+luca\b/.test(clean)) return 500

  const spokenNumbers: Record<string, number> = {
    un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5,
    seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, quince: 15,
    veinte: 20, treinta: 30, cuarenta: 40, cincuenta: 50, cien: 100
  }
  const spokenMatch = clean.match(/\b(un|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|quince|veinte|treinta|cuarenta|cincuenta|cien)\s+(lucas?|gambas?|palos?|millones?|millon)\b/)
  if (spokenMatch) {
    const unit = spokenMatch[2]
    const multiplier = unit.startsWith('luca') ? 1000
      : unit.startsWith('gamba') ? 100
      : 1000000
    return spokenNumbers[spokenMatch[1]] * multiplier
  }

  const match = text.match(/\$?\s*(\d[\d.,]*)\s*(millones?|millon|mil|k|m|lucas?|gambas?|palos?)?\b/i)
  if (!match) return null
  const raw = match[1]
  const suffix = normalize(match[2] ?? '')
  let value: number
  if (raw.includes(',') && raw.includes('.')) value = Number(raw.replace(/\./g, '').replace(',', '.'))
  else if (raw.includes(',')) value = Number(raw.replace(',', '.'))
  else if (raw.includes('.')) {
    const parts = raw.split('.')
    value = parts[parts.length - 1]?.length === 3 ? Number(parts.join('')) : Number(raw)
  } else value = Number(raw)
  if (suffix.startsWith('mil') || suffix === 'k' || suffix.startsWith('luca')) value *= 1000
  if (suffix.startsWith('gamba')) value *= 100
  if (suffix.startsWith('millon') || suffix === 'm' || suffix.startsWith('palo')) value *= 1000000
  return Number.isFinite(value) && value > 0 ? value : null
}

function parseMovement(text: string, categories: Category[], knowledge: KnowledgeEntry[], identity: Person): ParseResult {
  const clean = normalize(text)
  const amount = parseAmount(text)
  if (!amount) return { status: 'unknown' }

  // Inferimos el tipo por el sentido de la frase y por conceptos exclusivos de ingresos.
  // No exigimos que la persona escriba literalmente "gasté" o "cobré".
  const incomeSignals = /\b(cobre|cobro|cobré|me pagaron|me depositaron|recibi|recibí|ingreso|ingresaron|me transfirieron|vend[ií]|sueldo|salario|honorarios|dividendos|intereses)\b/.test(clean)
  const expenseSignals = /\b(gaste|gasté|pague|pagué|compre|compr[eé]|abone|abon[eé]|pedi|ped[ií]|consumi|consum[ií]|contrate|contrat[eé])\b/.test(clean)
  const incomeOnlyConcept = /\b(sueldo|salario|honorarios|dividendos|intereses|trabajo extra|changa|freelance)\b/.test(clean)
  const kind: Kind = incomeSignals || (!expenseSignals && incomeOnlyConcept) ? 'income' : 'expense'
  const rules: Array<{ category: string; words: string[]; concept: string }> = [
    { category: 'Alquiler', words: ['alquiler', 'renta'], concept: 'Alquiler' },
    { category: 'Expensas', words: ['expensas'], concept: 'Expensas' },
    { category: 'Supermercado', words: ['supermercado', 'super', 'carrefour', 'coto', 'dia%', 'verduleria', 'almacen', 'kiosco'], concept: 'Supermercado' },
    { category: 'Transporte', words: ['recarga sube', 'carga sube', 'sube', 'nafta', 'combustible', 'peaje', 'estacionamiento', 'uber', 'cabify', 'taxi', 'colectivo', 'tren', 'subte', 'bondi'], concept: 'Transporte' },
    { category: 'Servicios', words: ['electricidad', 'edenor', 'edesur', 'internet', 'wifi', 'agua', 'gas', 'telefono', 'celular', 'factura de luz', 'servicio de'], concept: 'Servicios' },
    { category: 'Salud', words: ['farmacia', 'medicamento', 'remedio', 'consulta', 'medico', 'medica', 'dentista'], concept: 'Salud' },
    { category: 'Gastronomía', words: ['restaurant', 'restaurante', 'cafe', 'bar', 'delivery', 'pizza', 'hamburguesa', 'helado', 'heladeria', 'postre', 'empanada', 'sushi', 'sandwich', 'milanesa', 'pastas', 'asado', 'parrilla', 'panaderia', 'facturas'], concept: 'Gastronomía' },
    { category: 'Indumentaria', words: ['ropa', 'remera', 'zapatilla', 'pantalon', 'camisa', 'buzo', 'jean', 'vestido'], concept: 'Indumentaria' },
    { category: 'Hogar', words: ['mueble', 'muebles', 'mesa', 'silla', 'cama', 'escritorio', 'placard', 'estanteria', 'lampara', 'decoracion', 'ferreteria', 'heladera', 'sillon', 'colchon', 'cortina', 'bazar', 'utensilios'], concept: 'Hogar' },
    { category: 'Sueldo', words: ['sueldo', 'salario', 'cobro del trabajo'], concept: 'Sueldo' },
    { category: 'Trabajo adicional', words: ['freelance', 'changa', 'trabajo extra'], concept: 'Trabajo adicional' },
    { category: 'Inversiones', words: ['inversion', 'intereses', 'dividendos'], concept: 'Inversiones' }
  ]
  const available = (name: string) => categories.some(category => category.name === name && category.kind === kind)

  // "Comida" por sí sola no permite distinguir entre supermercado y gastronomía.
  const mentionsFood = /\b(comida|comer|almuerzo|cena)\b/.test(clean)
  const hasSpecificFoodContext = rules
    .filter(rule => ['Supermercado', 'Gastronomía'].includes(rule.category))
    .some(rule => rule.words.some(word => hasTerm(clean, word)))
  if (kind === 'expense' && mentionsFood && !hasSpecificFoodContext) {
    const choices = ['Supermercado', 'Gastronomía']
      .filter(available)
      .map(category => ({ label: category, category }))
    if (choices.length > 1) {
      let person: Person = identity
      if (clean.includes('compartido') || clean.includes('entre los dos') || clean.includes('de los dos')) person = 'Compartido'
      else if (clean.includes('camila')) person = 'Camila'
      else if (clean.includes('agus')) person = 'Agus'
      return {
        status: 'clarify',
        text: '¿A qué tipo de comida corresponde este gasto?',
        pendingDraft: { date: today(), kind, concept: 'Comida', person, amount },
        choices
      }
    }
  }

  // Primero consultamos el catálogo compartido de Supabase. Las expresiones
  // más específicas tienen prioridad sobre las más generales.
  const knowledgeMatch = [...knowledge]
    .filter(entry => entry.movement_type === kind && available(entry.category_name) && hasTerm(clean, entry.normalized_phrase))
    .sort((a, b) => b.normalized_phrase.length - a.normalized_phrase.length || b.priority - a.priority)[0]

  if (knowledgeMatch) {
    let person: Person = ['Alquiler', 'Expensas', 'Servicios'].includes(knowledgeMatch.category_name) ? 'Compartido' : identity
    if (clean.includes('compartido') || clean.includes('entre los dos') || clean.includes('de los dos')) person = 'Compartido'
    else if (clean.includes('camila')) person = 'Camila'
    else if (clean.includes('agus')) person = 'Agus'
    const concept = knowledgeMatch.canonical_concept || knowledgeMatch.phrase
    return {
      status: 'ready',
      draft: { date: today(), kind, concept, category: knowledgeMatch.category_name, person, amount }
    }
  }

  const match = rules.find(rule => rule.words.some(word => hasTerm(clean, word)) && available(rule.category))
  if (!match) return { status: 'unknown' }

  let person: Person = ['Alquiler', 'Expensas', 'Servicios'].includes(match.category) ? 'Compartido' : identity
  if (clean.includes('compartido') || clean.includes('entre los dos') || clean.includes('de los dos')) person = 'Compartido'
  else if (clean.includes('camila')) person = 'Camila'
  else if (clean.includes('agus')) person = 'Agus'

  const matchedWord = match.words.find(word => hasTerm(clean, word))
  const concept = ['Indumentaria', 'Gastronomía'].includes(match.category)
    ? (matchedWord ?? match.concept)
    : match.concept
  const displayConcept = concept.charAt(0).toLocaleUpperCase('es-AR') + concept.slice(1)
  return { status: 'ready', draft: { date: today(), kind, concept: displayConcept, category: match.category, person, amount } }
}

export default function AssistantPanel({ categories, knowledge, onSave }: { categories: Category[]; knowledge: KnowledgeEntry[]; onSave: (draft: Draft) => Promise<boolean> }) {
  const [identity, setIdentity] = useState<Person>(() => (localStorage.getItem('enquegasto-assistant-person') as Person | null) ?? 'Agus')
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', text: '¡Hola! Contame qué gasto o ingreso querés registrar. Por ejemplo: “me compré una remera a 2.000 pesos” o “hoy pagué 600 mil del alquiler”.' }
  ])

  function updateIdentity(value: Person) {
    setIdentity(value)
    localStorage.setItem('enquegasto-assistant-person', value)
  }

  async function saveDraft(draft: Draft) {
    setBusy(true)
    const saved = await onSave(draft)
    setBusy(false)
    setMessages(current => [...current, {
      role: 'assistant',
      text: saved
        ? 'Listo, registré el movimiento. Si necesitás corregirlo, podés editarlo desde Movimientos.'
        : 'No pude guardar el movimiento. Revisá la conexión e intentá nuevamente.',
      draft: saved ? draft : undefined
    }])
  }

  async function chooseCategory(choice: CategoryChoice, pendingDraft: PendingDraft) {
    if (busy) return
    const draft: Draft = { ...pendingDraft, category: choice.category }
    setMessages(current => [
      ...current.map(message => message.choices ? { ...message, choices: undefined, pendingDraft: undefined } : message),
      { role: 'user', text: choice.label }
    ])
    await saveDraft(draft)
  }

  async function send(event: FormEvent) {
    event.preventDefault()
    const text = input.trim()
    if (!text || busy) return
    setInput('')
    setMessages(current => [...current, { role: 'user', text }])
    const result = parseMovement(text, categories, knowledge, identity)
    if (result.status === 'unknown') {
      setMessages(current => [...current, { role: 'assistant', text: 'No pude identificar con suficiente seguridad el importe o el concepto. No hace falta que escribas “gasté” o “cobré”: podés poner “mueble 20 mil”, “recarga SUBE 10 mil” o “sueldo 1 millón”. Si la frase puede ser un gasto o un ingreso, te voy a pedir que lo aclares antes de registrarlo.' }])
      return
    }
    if (result.status === 'clarify') {
      setMessages(current => [...current, {
        role: 'assistant',
        text: result.text,
        pendingDraft: result.pendingDraft,
        choices: result.choices
      }])
      return
    }
    await saveDraft(result.draft)
  }

  return <section className="assistant-page">
    <div className="page-heading"><div><div className="eyebrow">ASISTENTE DE CARGA</div><h1>Asistente</h1><p>Registrá gastos e ingresos escribiendo como hablás.</p></div><div className="assistant-status"><span /> Sin servicios pagos</div></div>
    <div className="assistant-layout">
      <div className="panel assistant-chat">
        <div className="assistant-chat-heading"><div className="assistant-avatar"><Bot size={20}/></div><div><strong>Asistente de EnQuéGasto</strong><small><span/> Disponible · {knowledge.length} conceptos en su catálogo</small></div><Sparkles size={18} className="assistant-sparkle"/></div>
        <div className="assistant-messages">
          {messages.map((message, index) => <div className={'assistant-message ' + message.role} key={index}>
            <div className="assistant-message-icon">{message.role === 'assistant' ? <Bot size={15}/> : <UserRound size={15}/>}</div>
            <div className="assistant-bubble"><p>{message.text}</p>
              {message.choices && message.pendingDraft && <div className="assistant-choices">{message.choices.map(choice => <button type="button" key={choice.category} disabled={busy} onClick={() => chooseCategory(choice, message.pendingDraft!)}>{choice.label}</button>)}</div>}
              {message.draft && <div className="assistant-receipt"><div><span>Concepto</span><strong>{message.draft.concept}</strong></div><div><span>Categoría</span><strong>{message.draft.category}</strong></div><div><span>Persona</span><strong>{message.draft.person}</strong></div><div><span>Importe</span><strong>{new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0}).format(message.draft.amount)}</strong></div><div className="assistant-saved"><CheckCircle2 size={14}/> Registrado</div></div>}
            </div>
          </div>)}
          {busy && <div className="assistant-typing"><LoaderCircle size={15}/> Registrando movimiento...</div>}
        </div>
        <form className="assistant-composer" onSubmit={send}>
          <input value={input} onChange={event => setInput(event.target.value)} placeholder="Ej. gasté 8.500 en una farmacia..." aria-label="Describí un gasto o ingreso"/>
          <button type="submit" disabled={!input.trim() || busy} aria-label="Enviar mensaje"><CornerDownLeft size={18}/></button>
        </form>
        <div className="assistant-footnote"><MessageCircle size={13}/> El asistente consulta el catálogo compartido de Supabase y aplica reglas locales, sin una API de IA paga.</div>
      </div>
      <aside className="panel assistant-settings">
        <div className="assistant-settings-icon"><UserRound size={19}/></div>
        <h2>¿Quién está usando el asistente?</h2>
        <p>Esto permite asignar automáticamente los gastos personales. Se guarda en este dispositivo.</p>
        <label className="field-label">Tu persona<select value={identity} onChange={event => updateIdentity(event.target.value as Person)}><option value="Agus">Agus</option><option value="Camila">Camila</option></select></label>
        <div className="assistant-rule"><CheckCircle2 size={15}/> Alquiler, expensas y servicios se asignan a Compartido automáticamente.</div>
        <div className="assistant-rule"><CheckCircle2 size={15}/> Si el mensaje menciona a Agus o Camila, se usa esa persona.</div>
      </aside>
    </div>
  </section>
}

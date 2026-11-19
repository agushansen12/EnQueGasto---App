import { useState } from 'react'
import type { FormEvent } from 'react'
import { Bot, CheckCircle2, CornerDownLeft, LoaderCircle, MessageCircle, Sparkles, UserRound } from 'lucide-react'

type Kind = 'expense' | 'income'
type Person = 'Agus' | 'Camila' | 'Compartido'
type Category = { id: string; name: string; kind: Kind }
type Draft = { date: string; kind: Kind; concept: string; category: string; person: Person; amount: number; comment?: string }
type Message = { role: 'user' | 'assistant'; text: string; draft?: Draft }

const today = () => new Date().toLocaleDateString('en-CA')
const normalize = (value: string) => value.toLocaleLowerCase('es-AR').normalize('NFD').replace(/[\u0300-\u036f]/g, '')

function parseAmount(text: string): number | null {
  const match = text.match(/\$?\s*(\d[\d.,]*)\s*(millones?|millon|mil|k|m)?\b/i)
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
  if (suffix.startsWith('mil') || suffix === 'k') value *= 1000
  if (suffix.startsWith('millon') || suffix === 'm') value *= 1000000
  return Number.isFinite(value) && value > 0 ? value : null
}

function parseMovement(text: string, categories: Category[], identity: Person): Draft | null {
  const clean = normalize(text)
  const amount = parseAmount(text)
  if (!amount) return null

  const incomeWords = ['cobre', 'cobro', 'me pagaron', 'me depositaron', 'recibi', 'sueldo', 'ingreso', 'vendí', 'vendi']
  const kind: Kind = incomeWords.some(word => clean.includes(word)) ? 'income' : 'expense'
  const rules: Array<{ category: string; words: string[]; concept: string }> = [
    { category: 'Alquiler', words: ['alquiler', 'renta'], concept: 'Alquiler' },
    { category: 'Expensas', words: ['expensas'], concept: 'Expensas' },
    { category: 'Supermercado', words: ['supermercado', 'super', 'carrefour', 'coto', 'dia%', 'verduleria', 'almacen', 'kiosco'], concept: 'Supermercado' },
    { category: 'Servicios', words: ['luz', 'electricidad', 'edenor', 'edesur', 'internet', 'wifi', 'agua', 'gas', 'telefono', 'celular'], concept: 'Servicios' },
    { category: 'Transporte', words: ['nafta', 'combustible', 'sube', 'uber', 'cabify', 'taxi', 'colectivo', 'tren'], concept: 'Transporte' },
    { category: 'Salud', words: ['farmacia', 'medicamento', 'remedio', 'consulta', 'medico', 'medica', 'dentista'], concept: 'Salud' },
    { category: 'Gastronomía', words: ['restaurant', 'restaurante', 'cafe', 'bar', 'delivery', 'pizza', 'hamburguesa', 'comida'], concept: 'Gastronomía' },
    { category: 'Indumentaria', words: ['ropa', 'remera', 'zapatilla', 'pantalon', 'camisa', 'buzo', 'jean', 'vestido'], concept: 'Indumentaria' },
    { category: 'Hogar', words: ['mueble', 'decoracion', 'ferreteria', 'heladera', 'sillon', 'colchon'], concept: 'Hogar' },
    { category: 'Sueldo', words: ['sueldo', 'salario', 'cobro del trabajo'], concept: 'Sueldo' },
    { category: 'Trabajo adicional', words: ['freelance', 'changa', 'trabajo extra'], concept: 'Trabajo adicional' },
    { category: 'Inversiones', words: ['inversion', 'intereses', 'dividendos'], concept: 'Inversiones' }
  ]
  const match = rules.find(rule => rule.words.some(word => clean.includes(word)) && categories.some(category => category.name === rule.category && category.kind === kind))
  if (!match) return null

  let person: Person = ['Alquiler', 'Expensas', 'Servicios'].includes(match.category) ? 'Compartido' : identity
  if (clean.includes('compartido') || clean.includes('entre los dos') || clean.includes('de los dos')) person = 'Compartido'
  else if (clean.includes('camila')) person = 'Camila'
  else if (clean.includes('agus')) person = 'Agus'

  const concept = match.category === 'Indumentaria'
    ? (rules.find(rule => rule.category === match.category && rule.words.some(word => clean.includes(word)))?.words.find(word => clean.includes(word)) ?? 'Indumentaria')
    : match.concept
  const displayConcept = concept.charAt(0).toLocaleUpperCase('es-AR') + concept.slice(1)
  return { date: today(), kind, concept: displayConcept, category: match.category, person, amount }
}

export default function AssistantPanel({ categories, onSave }: { categories: Category[]; onSave: (draft: Draft) => Promise<boolean> }) {
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

  async function send(event: FormEvent) {
    event.preventDefault()
    const text = input.trim()
    if (!text || busy) return
    setInput('')
    setMessages(current => [...current, { role: 'user', text }])
    const draft = parseMovement(text, categories, identity)
    if (!draft) {
      setMessages(current => [...current, { role: 'assistant', text: 'No pude identificar con suficiente seguridad el importe o la categoría. Probá indicando el concepto y el monto, por ejemplo: “pagué 12.000 de supermercado”. Por ahora reconozco las categorías habituales del hogar.' }])
      return
    }
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

  return <section className="assistant-page">
    <div className="page-heading"><div><div className="eyebrow">ASISTENTE DE CARGA</div><h1>Asistente</h1><p>Registrá gastos e ingresos escribiendo como hablás.</p></div><div className="assistant-status"><span /> Sin servicios pagos</div></div>
    <div className="assistant-layout">
      <div className="panel assistant-chat">
        <div className="assistant-chat-heading"><div className="assistant-avatar"><Bot size={20}/></div><div><strong>Asistente de EnQuéGasto</strong><small><span/> Disponible · interpretación local</small></div><Sparkles size={18} className="assistant-sparkle"/></div>
        <div className="assistant-messages">
          {messages.map((message, index) => <div className={'assistant-message ' + message.role} key={index}>
            <div className="assistant-message-icon">{message.role === 'assistant' ? <Bot size={15}/> : <UserRound size={15}/>}</div>
            <div className="assistant-bubble"><p>{message.text}</p>{message.draft && <div className="assistant-receipt"><div><span>Concepto</span><strong>{message.draft.concept}</strong></div><div><span>Categoría</span><strong>{message.draft.category}</strong></div><div><span>Persona</span><strong>{message.draft.person}</strong></div><div><span>Importe</span><strong>{new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0}).format(message.draft.amount)}</strong></div><div className="assistant-saved"><CheckCircle2 size={14}/> Registrado</div></div>}</div>
          </div>)}
          {busy && <div className="assistant-typing"><LoaderCircle size={15}/> Registrando movimiento...</div>}
        </div>
        <form className="assistant-composer" onSubmit={send}>
          <input value={input} onChange={event => setInput(event.target.value)} placeholder="Ej. gasté 8.500 en una farmacia..." aria-label="Describí un gasto o ingreso"/>
          <button type="submit" disabled={!input.trim() || busy} aria-label="Enviar mensaje"><CornerDownLeft size={18}/></button>
        </form>
        <div className="assistant-footnote"><MessageCircle size={13}/> Los mensajes se procesan en tu navegador. No usamos una API de IA paga.</div>
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

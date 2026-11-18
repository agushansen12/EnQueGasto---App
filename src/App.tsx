import { useEffect, useMemo, useState } from 'react'
import { Activity, ArrowDownLeft, ArrowLeft, ArrowRight, ArrowUpRight, CalendarDays, ChartNoAxesCombined, Check, ChevronDown, CircleHelp, CreditCard, Download, LayoutDashboard, ListFilter, Plus, Search, Settings, SlidersHorizontal, Trash2, Wallet, X } from 'lucide-react'

type Kind = 'expense' | 'income'
type Person = 'Agus' | 'Camila' | 'Compartido'
type Movement = { id: string; date: string; kind: Kind; concept: string; category: string; person: Person; amount: number; comment?: string; recordedBy: string }
type Category = { name: string; kind: Kind }

const initialCategories: Category[] = [
  { name: 'Alquiler', kind: 'expense' }, { name: 'Expensas', kind: 'expense' }, { name: 'Supermercado', kind: 'expense' },
  { name: 'Servicios', kind: 'expense' }, { name: 'Transporte', kind: 'expense' }, { name: 'Gastronomía', kind: 'expense' },
  { name: 'Salud', kind: 'expense' }, { name: 'Hogar', kind: 'expense' }, { name: 'Indumentaria', kind: 'expense' },
  { name: 'Otros gastos', kind: 'expense' }, { name: 'Sueldo', kind: 'income' }, { name: 'Trabajo adicional', kind: 'income' },
  { name: 'Inversiones', kind: 'income' }, { name: 'Otros ingresos', kind: 'income' },
]
const today = new Date().toISOString().slice(0, 10)
const monthKey = (date: string) => date.slice(0, 7)
const money = (value: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value)
const dateLabel = (date: string) => new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(date + 'T12:00:00'))
const seed: Movement[] = [
  { id: 'demo-1', date: today, kind: 'income', concept: 'Sueldo', category: 'Sueldo', person: 'Agus', amount: 1820000, recordedBy: 'Agus' },
  { id: 'demo-2', date: today, kind: 'expense', concept: 'Alquiler', category: 'Alquiler', person: 'Compartido', amount: 650000, recordedBy: 'Agus' },
  { id: 'demo-3', date: today, kind: 'expense', concept: 'Compras del mes', category: 'Supermercado', person: 'Compartido', amount: 85400, recordedBy: 'Camila' },
  { id: 'demo-4', date: today, kind: 'income', concept: 'Ingreso mensual', category: 'Sueldo', person: 'Camila', amount: 1450000, recordedBy: 'Camila' },
  { id: 'demo-5', date: today, kind: 'expense', concept: 'Expensas', category: 'Expensas', person: 'Compartido', amount: 120000, recordedBy: 'Camila' },
]
const nav = [
  { id: 'home', label: 'Resumen', icon: LayoutDashboard },
  { id: 'movements', label: 'Movimientos', icon: Activity },
  { id: 'categories', label: 'Categorías', icon: SlidersHorizontal },
  { id: 'settings', label: 'Ajustes', icon: Settings },
] as const
type Page = typeof nav[number]['id']

function App() {
  const [page, setPage] = useState<Page>('home')
  const [movements, setMovements] = useState<Movement[]>(() => {
    try { const saved = localStorage.getItem('enquegasto-movements'); return saved ? JSON.parse(saved) as Movement[] : seed } catch { return seed }
  })
  const [categories, setCategories] = useState<Category[]>(() => {
    try { const saved = localStorage.getItem('enquegasto-categories'); return saved ? JSON.parse(saved) as Category[] : initialCategories } catch { return initialCategories }
  })
  const [month, setMonth] = useState(monthKey(today))
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState<Movement | null>(null)
  const [filter, setFilter] = useState('Todos')
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState('')
  useEffect(() => { localStorage.setItem('enquegasto-movements', JSON.stringify(movements)) }, [movements])
  useEffect(() => { localStorage.setItem('enquegasto-categories', JSON.stringify(categories)) }, [categories])

  const monthMovements = useMemo(() => movements.filter(m => monthKey(m.date) === month), [movements, month])
  const income = monthMovements.filter(m => m.kind === 'income').reduce((s, m) => s + m.amount, 0)
  const expenses = monthMovements.filter(m => m.kind === 'expense').reduce((s, m) => s + m.amount, 0)
  const balance = income - expenses
  const recent = [...monthMovements].sort((a, b) => b.date.localeCompare(a.date))
  const expenseByCategory = categories.filter(c => c.kind === 'expense').map(c => ({ name: c.name, total: monthMovements.filter(m => m.kind === 'expense' && m.category === c.name).reduce((s, m) => s + m.amount, 0) })).filter(c => c.total > 0).sort((a, b) => b.total - a.total)
  const maxCategory = Math.max(1, ...expenseByCategory.map(c => c.total))
  const filtered = movements.filter(m => (filter === 'Todos' || m.person === filter) && (m.concept.toLowerCase().includes(search.toLowerCase()) || m.category.toLowerCase().includes(search.toLowerCase()))).sort((a, b) => b.date.localeCompare(a.date))

  function notify(message: string) { setToast(message); window.setTimeout(() => setToast(''), 2400) }
  function saveMovement(m: Movement) {
    setMovements(current => editing ? current.map(x => x.id === m.id ? m : x) : [m, ...current])
    setModal(false); setEditing(null); notify(editing ? 'Movimiento actualizado' : 'Movimiento agregado')
  }
  function removeMovement(id: string) { setMovements(current => current.filter(m => m.id !== id)); notify('Movimiento eliminado') }
  function changeMonth(delta: number) { const d = new Date(month + '-15T12:00:00'); d.setMonth(d.getMonth() + delta); setMonth(monthKey(d.toISOString())) }
  function exportCsv() {
    const rows = [['Fecha', 'Tipo', 'Concepto', 'Categoría', 'Persona', 'Monto', 'Comentario'], ...movements.map(m => [m.date, m.kind === 'income' ? 'Ingreso' : 'Gasto', m.concept, m.category, m.person, String(m.amount), m.comment ?? ''])]
    const csv = rows.map(row => row.map(v => '"' + v.replaceAll('"', '""') + '"').join(';')).join('\n')
    const url = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a'); a.href = url; a.download = 'enquegasto-movimientos.csv'; a.click(); URL.revokeObjectURL(url)
  }
  const monthName = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' }).format(new Date(month + '-15T12:00:00'))

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><Wallet size={21} /></div><div><strong>EnQuéGasto</strong><span>Finanzas compartidas</span></div></div>
      <div className="workspace-label">TU ESPACIO</div>
      <nav>{nav.map(item => <button key={item.id} className={page === item.id ? 'nav-item active' : 'nav-item'} onClick={() => setPage(item.id)}><item.icon size={18} /><span>{item.label}</span>{item.id === 'movements' && <span className="nav-count">{movements.length}</span>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="couple-avatar"><span>A</span><span>C</span></div><div className="couple-copy"><strong>Agus y Camila</strong><span>Hogar compartido</span></div><ChevronDown size={15} className="muted-icon" /></div>
    </aside>
    <main className="main-area">
      <header className="topbar"><div className="breadcrumb">Finanzas <span>/</span> <strong>{nav.find(n => n.id === page)?.label}</strong></div><div className="top-actions"><span className="local-pill"><span className="status-dot" /> Datos en este dispositivo</span><button className="icon-button" title="Ayuda"><CircleHelp size={18} /></button><div className="user-avatar">A</div></div></header>
      <div className="page-content">
        {page === 'home' && <><div className="page-heading"><div><div className="eyebrow">TU ECONOMÍA, EN CLARO</div><h1>Resumen</h1><p>Así se mueve la economía de tu hogar.</p></div><button className="primary-button" onClick={() => { setEditing(null); setModal(true) }}><Plus size={17} /> Nuevo movimiento</button></div>
          <div className="month-control"><button className="icon-button" onClick={() => changeMonth(-1)}><ArrowLeft size={17} /></button><CalendarDays size={16} /><span>{monthName}</span><button className="icon-button" onClick={() => changeMonth(1)}><ArrowRight size={17} /></button><button className="text-button" onClick={() => setMonth(monthKey(today))}>Este mes</button></div>
          <section className="stat-grid">
            <div className="stat-card"><div className="stat-top"><span>Ingresos</span><span className="stat-icon income-icon"><ArrowDownLeft size={18} /></span></div><strong>{money(income)}</strong><small className="positive">Total ingresado este mes</small></div>
            <div className="stat-card"><div className="stat-top"><span>Gastos</span><span className="stat-icon expense-icon"><ArrowUpRight size={18} /></span></div><strong>{money(expenses)}</strong><small>Todo lo que salió este mes</small></div>
            <div className="stat-card balance-card"><div className="stat-top"><span>Balance disponible</span><span className="stat-icon balance-icon"><Wallet size={18} /></span></div><strong>{money(balance)}</strong><small>{balance >= 0 ? 'Ingresos menos gastos' : 'Gastaron más de lo que ingresó'}</small></div>
          </section>
          <section className="content-grid">
            <div className="panel recent-panel"><div className="panel-heading"><div><h2>Últimos movimientos</h2><p>Actividad registrada durante el mes</p></div><button className="subtle-button" onClick={() => setPage('movements')}>Ver todos <ArrowRight size={15} /></button></div>
              {recent.length ? <div className="movement-list">{recent.slice(0, 5).map(m => <MovementRow key={m.id} movement={m} onEdit={() => { setEditing(m); setModal(true) }} />)}</div> : <EmptyState text="Todavía no hay movimientos en este mes." />}
            </div>
            <div className="panel category-panel"><div className="panel-heading"><div><h2>En qué se va</h2><p>Gastos por categoría</p></div><ChartNoAxesCombined size={19} className="muted-icon" /></div>
              {expenseByCategory.length ? <div className="category-bars">{expenseByCategory.slice(0, 6).map(c => <div className="bar-row" key={c.name}><div className="bar-label"><span>{c.name}</span><strong>{money(c.total)}</strong></div><div className="bar-track"><div className="bar-fill" style={{ width: (c.total / maxCategory * 100) + '%' }} /></div></div>)}</div> : <EmptyState text="Cuando cargues gastos, vas a ver el detalle acá." />}
              <div className="category-total"><span>Total de gastos</span><strong>{money(expenses)}</strong></div>
            </div>
          </section>
          <div className="insight-strip"><div className="insight-icon"><Activity size={18} /></div><div><strong>Una economía, tres formas de registrar</strong><p>Podés cargar movimientos tuyos, de Camila o compartidos. Todo queda ordenado en un mismo lugar.</p></div></div>
        </>}
        {page === 'movements' && <><div className="page-heading"><div><div className="eyebrow">REGISTRO</div><h1>Movimientos</h1><p>Ingresos y gastos de ustedes dos.</p></div><button className="primary-button" onClick={() => { setEditing(null); setModal(true) }}><Plus size={17} /> Nuevo movimiento</button></div>
          <div className="toolbar"><div className="search-box"><Search size={17} /><input placeholder="Buscar concepto o categoría..." value={search} onChange={e => setSearch(e.target.value)} /></div><div className="filter-wrap"><ListFilter size={16} /><select value={filter} onChange={e => setFilter(e.target.value)}><option>Todos</option><option>Agus</option><option>Camila</option><option>Compartido</option></select></div><button className="subtle-button export-button" onClick={exportCsv}><Download size={16} /> Exportar</button></div>
          <div className="panel table-panel">{filtered.length ? <div className="table-scroll"><table><thead><tr><th>Movimiento</th><th>Persona</th><th>Fecha</th><th className="align-right">Importe</th><th></th></tr></thead><tbody>{filtered.map(m => <tr key={m.id}><td><div className="table-concept"><span className={m.kind === 'income' ? 'mini-kind income-kind' : 'mini-kind expense-kind'}>{m.kind === 'income' ? <ArrowDownLeft size={15} /> : <ArrowUpRight size={15} />}</span><div><strong>{m.concept}</strong><small>{m.category}{m.comment ? ' · ' + m.comment : ''}</small></div></div></td><td><PersonTag person={m.person} /></td><td className="date-cell">{dateLabel(m.date)}</td><td className={m.kind === 'income' ? 'align-right amount-income' : 'align-right amount-expense'}>{m.kind === 'income' ? '+' : '−'}{money(m.amount)}</td><td><div className="row-actions"><button className="icon-button small" title="Editar" onClick={() => { setEditing(m); setModal(true) }}><SlidersHorizontal size={15} /></button><button className="icon-button small danger-hover" title="Eliminar" onClick={() => removeMovement(m.id)}><Trash2 size={15} /></button></div></td></tr>)}</tbody></table></div> : <EmptyState text="No encontramos movimientos con esos filtros." />}</div>
        </>}
        {page === 'categories' && <><div className="page-heading"><div><div className="eyebrow">ORGANIZACIÓN</div><h1>Categorías</h1><p>Organizá los movimientos a tu manera.</p></div><button className="primary-button" onClick={() => { const name = window.prompt('Nombre de la categoría'); if (name?.trim() && !categories.some(c => c.name.toLowerCase() === name.trim().toLowerCase())) { setCategories([...categories, { name: name.trim(), kind: 'expense' }]); notify('Categoría creada') } }}><Plus size={17} /> Nueva categoría</button></div>
          <div className="category-columns"><CategoryGroup title="Gastos" kind="expense" categories={categories} onDelete={name => setCategories(categories.filter(c => c.name !== name))} /><CategoryGroup title="Ingresos" kind="income" categories={categories} onDelete={name => setCategories(categories.filter(c => c.name !== name))} /></div>
        </>}
        {page === 'settings' && <><div className="page-heading"><div><div className="eyebrow">PREFERENCIAS</div><h1>Ajustes</h1><p>Configuración de tu espacio compartido.</p></div></div><div className="panel settings-panel"><div className="settings-row"><div className="settings-symbol"><Wallet size={19} /></div><div><strong>Hogar compartido</strong><p>Agus y Camila</p></div><span className="settings-value">Espacio personal</span></div><div className="settings-row"><div className="settings-symbol"><Download size={19} /></div><div><strong>Exportar movimientos</strong><p>Descargá tus registros en formato CSV para abrirlos en Excel.</p></div><button className="subtle-button" onClick={exportCsv}>Exportar <ArrowRight size={15} /></button></div><div className="settings-row"><div className="settings-symbol"><Activity size={19} /></div><div><strong>Almacenamiento</strong><p>Por ahora, los datos se guardan localmente en este navegador.</p></div><span className="settings-value warning-text">Sin sincronización</span></div><div className="settings-note"><strong>Próximo paso: sincronización compartida</strong><p>Esta versión inicial todavía no conecta las cuentas de Google ni comparte datos entre dispositivos. Antes de usarla como registro real, vamos a incorporar un almacenamiento privado compartido y acceso autenticado.</p></div></div></>}
      </div>
      <footer className="footer"><span>EnQuéGasto <span className="footer-dot">·</span> Hecho para organizar lo cotidiano.</span><span>Versión inicial 0.1</span></footer>
    </main>
    {modal && <MovementModal categories={categories} editing={editing} onClose={() => { setModal(false); setEditing(null) }} onSave={saveMovement} />}
    {toast && <div className="toast"><Check size={16} />{toast}</div>}
  </div>
}

function MovementRow({ movement: m, onEdit }: { movement: Movement; onEdit: () => void }) {
  return <button className="movement-row" onClick={onEdit}><span className={m.kind === 'income' ? 'movement-icon income-kind' : 'movement-icon expense-kind'}>{m.kind === 'income' ? <ArrowDownLeft size={17} /> : <ArrowUpRight size={17} />}</span><span className="movement-main"><strong>{m.concept}</strong><small>{m.category} <span>·</span> {m.person}</small></span><span className={m.kind === 'income' ? 'movement-amount amount-income' : 'movement-amount amount-expense'}>{m.kind === 'income' ? '+' : '−'}{money(m.amount)}</span></button>
}
function PersonTag({ person }: { person: Person }) { return <span className={'person-tag ' + person.toLowerCase()}><i />{person}</span> }
function EmptyState({ text }: { text: string }) { return <div className="empty-state"><div className="empty-icon"><Wallet size={21} /></div><p>{text}</p></div> }
function CategoryGroup({ title, kind, categories, onDelete }: { title: string; kind: Kind; categories: Category[]; onDelete: (name: string) => void }) {
  return <div className="panel category-group"><div className="panel-heading"><div><h2>{title}</h2><p>{categories.filter(c => c.kind === kind).length} categorías</p></div><span className={kind === 'income' ? 'group-icon income-kind' : 'group-icon expense-kind'}>{kind === 'income' ? <ArrowDownLeft size={17} /> : <ArrowUpRight size={17} />}</span></div>{categories.filter(c => c.kind === kind).map(c => <div className="category-item" key={c.name}><span>{c.name}</span><button className="icon-button small danger-hover" title={'Eliminar ' + c.name} onClick={() => onDelete(c.name)}><Trash2 size={14} /></button></div>)}</div>
}
function MovementModal({ categories, editing, onClose, onSave }: { categories: Category[]; editing: Movement | null; onClose: () => void; onSave: (m: Movement) => void }) {
  const [kind, setKind] = useState<Kind>(editing?.kind ?? 'expense')
  const [concept, setConcept] = useState(editing?.concept ?? '')
  const [amount, setAmount] = useState(editing ? String(editing.amount) : '')
  const [category, setCategory] = useState(editing?.category ?? categories.find(c => c.kind === 'expense')?.name ?? '')
  const [person, setPerson] = useState<Person>(editing?.person ?? 'Compartido')
  const [date, setDate] = useState(editing?.date ?? today)
  const [comment, setComment] = useState(editing?.comment ?? '')
  const availableCategories = categories.filter(c => c.kind === kind)
  useEffect(() => { if (!availableCategories.some(c => c.name === category)) setCategory(availableCategories[0]?.name ?? '') }, [kind, categories])
  function submit(e: React.FormEvent) { e.preventDefault(); const value = Number(amount.replace(',', '.')); if (!concept.trim() || !Number.isFinite(value) || value <= 0 || !category) return; onSave({ id: editing?.id ?? crypto.randomUUID(), date, kind, concept: concept.trim(), category, person, amount: value, comment: comment.trim() || undefined, recordedBy: 'Agus' }) }
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}><form className="modal" onSubmit={submit}><div className="modal-header"><div><div className="eyebrow">{editing ? 'ACTUALIZAR REGISTRO' : 'NUEVO REGISTRO'}</div><h2>{editing ? 'Editar movimiento' : 'Agregar movimiento'}</h2></div><button type="button" className="icon-button" onClick={onClose}><X size={19} /></button></div>
    <div className="kind-switch"><button type="button" className={kind === 'expense' ? 'selected expense-selected' : ''} onClick={() => setKind('expense')}><ArrowUpRight size={16} /> Gasto</button><button type="button" className={kind === 'income' ? 'selected income-selected' : ''} onClick={() => setKind('income')}><ArrowDownLeft size={16} /> Ingreso</button></div>
    <label className="field-label">Concepto<input autoFocus placeholder="Ej. Compra del supermercado" value={concept} onChange={e => setConcept(e.target.value)} required /></label>
    <div className="field-grid"><label className="field-label">Importe<div className="amount-input"><span>$</span><input type="number" min="1" step="0.01" placeholder="0" value={amount} onChange={e => setAmount(e.target.value)} required /></div></label><label className="field-label">Fecha<input type="date" value={date} onChange={e => setDate(e.target.value)} required /></label></div>
    <div className="field-grid"><label className="field-label">Categoría<select value={category} onChange={e => setCategory(e.target.value)} required>{availableCategories.map(c => <option key={c.name}>{c.name}</option>)}</select></label><label className="field-label">¿De quién es?<select value={person} onChange={e => setPerson(e.target.value as Person)}><option>Compartido</option><option>Agus</option><option>Camila</option></select></label></div>
    <label className="field-label">Comentario <span className="optional">(opcional)</span><textarea rows={2} placeholder="Un detalle para recordar..." value={comment} onChange={e => setComment(e.target.value)} /></label>
    <div className="modal-footer"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" type="submit"><Check size={16} /> {editing ? 'Guardar cambios' : 'Guardar movimiento'}</button></div>
    </form></div>
}

export default App
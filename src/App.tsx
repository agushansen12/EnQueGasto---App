import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import AssistantPanel from './components/AssistantPanel'
import { Activity, Bot, ArrowDownLeft, ArrowLeft, ArrowRight, ArrowUpRight, CalendarDays, ChartNoAxesCombined, Check, ChevronDown, CircleHelp, Download, Fingerprint, LayoutDashboard, ListFilter, Moon, Plus, Search, Settings, SlidersHorizontal, Sun, Trash2, Wallet, X } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

type Kind = 'expense' | 'income'
type Person = 'Agus' | 'Camila' | 'Compartido'
type Movement = { id: string; date: string; kind: Kind; concept: string; category: string; person: Person; amount: number; comment?: string; recordedBy: string }
type Category = { id: string; name: string; kind: Kind }
type Installment = { id: string; plan_id: string; movement_id: string; installment_number: number; due_date: string; amount: number; status: 'pending' | 'paid'; plan?: { concept: string; person: Person; installment_count: number } }

const today = new Date().toISOString().slice(0, 10)
const monthKey = (date: string) => date.slice(0, 7)
const money = (value: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value)
const dateLabel = (date: string) => new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(date + 'T12:00:00'))
const nav = [
  { id: 'home', label: 'Resumen', icon: LayoutDashboard },
  { id: 'movements', label: 'Movimientos', icon: Activity },
  { id: 'assistant', label: 'Asistente', icon: Bot },
  { id: 'dashboards', label: 'Dashboards', icon: ChartNoAxesCombined },
  { id: 'installments', label: 'Cuotas', icon: CalendarDays },
  { id: 'categories', label: 'Categorías', icon: SlidersHorizontal },
  { id: 'settings', label: 'Ajustes', icon: Settings },
] as const
type Page = typeof nav[number]['id']

function FinanceApp({ household, userId, onSignOut }: { household: Household; userId: string; onSignOut: () => void }) {
  const [page, setPage] = useState<Page>('home')
  const [theme, setTheme] = useState<'light' | 'dark'>(() => localStorage.getItem('enquegasto-theme') === 'dark' ? 'dark' : 'light')
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('enquegasto-theme', theme)
  }, [theme])
  const [movements, setMovements] = useState<Movement[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [installments, setInstallments] = useState<Installment[]>([])
  const [plans, setPlans] = useState<any[]>([])
  const [installmentForm, setInstallmentForm] = useState(false)
  const [dataLoading, setDataLoading] = useState(true)
  const [dataError, setDataError] = useState('')
  const [month, setMonth] = useState(monthKey(today))
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState<Movement | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Movement | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [filter, setFilter] = useState('Todos')
  const [analyticsPerson, setAnalyticsPerson] = useState('Todos')
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState('')
  const [passkeyBusy, setPasskeyBusy] = useState(false)
  useEffect(() => {
    let active = true
    async function loadData() {
      if (!supabase) return
      setDataLoading(true); setDataError('')
      const [categoryResult, movementResult, planResult, installmentResult] = await Promise.all([
        supabase.from('categories').select('id,name,type').eq('household_id', household.id).order('name'),
        supabase.from('movements').select('id,category_id,type,concept,amount,movement_date,person,comment,recorded_by').eq('household_id', household.id).order('movement_date', { ascending: false }),
        supabase.from('installment_plans').select('id,concept,person,purchase_total,financed_total,installment_count,first_due_date,status').eq('household_id', household.id).order('first_due_date', { ascending: true }),
        supabase.from('installments').select('id,plan_id,movement_id,installment_number,due_date,amount,status').eq('household_id', household.id).order('due_date', { ascending: true })
      ])
      if (!active) return
      if (categoryResult.error || movementResult.error || planResult.error || installmentResult.error) {
        setDataError(categoryResult.error?.message || movementResult.error?.message || planResult.error?.message || installmentResult.error?.message || 'No se pudieron cargar los datos.')
        setDataLoading(false); return
      }
      const loadedCategories = (categoryResult.data ?? []).map(c => ({ id: c.id, name: c.name, kind: c.type as Kind }))
      const categoryNames = new Map(loadedCategories.map(c => [c.id, c.name]))
      const loadedMovements = (movementResult.data ?? []).map(m => ({
        id: m.id, date: m.movement_date, kind: m.type as Kind, concept: m.concept,
        category: categoryNames.get(m.category_id ?? '') ?? 'Sin categoría',
        person: m.person as Person, amount: Number(m.amount), comment: m.comment ?? undefined,
        recordedBy: m.recorded_by
      }))
      setCategories(loadedCategories); setMovements(loadedMovements); setPlans(planResult.data ?? []); setInstallments((installmentResult.data ?? []) as Installment[]); setDataLoading(false)
    }
    loadData()
    return () => { active = false }
  }, [household.id])

  const monthMovements = useMemo(() => movements.filter(m => monthKey(m.date) === month), [movements, month])
  const income = monthMovements.filter(m => m.kind === 'income').reduce((s, m) => s + m.amount, 0)
  const expenses = monthMovements.filter(m => m.kind === 'expense').reduce((s, m) => s + m.amount, 0)
  const balance = income - expenses
  const recent = [...monthMovements].sort((a, b) => b.date.localeCompare(a.date))
  const expenseByCategory = categories.filter(c => c.kind === 'expense').map(c => ({ name: c.name, total: monthMovements.filter(m => m.kind === 'expense' && m.category === c.name).reduce((s, m) => s + m.amount, 0) })).filter(c => c.total > 0).sort((a, b) => b.total - a.total)
  const maxCategory = Math.max(1, ...expenseByCategory.map(c => c.total))
  const analyticsMovements = movements.filter(m => analyticsPerson === 'Todos' || m.person === analyticsPerson)
  const analyticsMonthMovements = analyticsMovements.filter(m => monthKey(m.date) === month)
  const aggregateByCategory = (kind: Kind) => Object.values(analyticsMonthMovements.filter(m => m.kind === kind).reduce<Record<string, { name: string; total: number }>>((acc, m) => {
    const name = m.category || 'Sin categoría'
    acc[name] = acc[name] ?? { name, total: 0 }
    acc[name].total += m.amount
    return acc
  }, {})).sort((a, b) => b.total - a.total)
  const expensePieData = aggregateByCategory('expense')
  const incomePieData = aggregateByCategory('income')
  const previousMonthDate = new Date(month + '-01T12:00:00')
  previousMonthDate.setMonth(previousMonthDate.getMonth() - 1)
  const previousMonth = monthKey(previousMonthDate.toISOString())
  const trendData = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(month + '-01T12:00:00')
    date.setMonth(date.getMonth() - (5 - index))
    const key = monthKey(date.toISOString())
    return {
      month: new Intl.DateTimeFormat('es-AR', { month: 'short' }).format(date).replace('.', ''),
      expenses: analyticsMovements.filter(m => m.kind === 'expense' && monthKey(m.date) === key).reduce((sum, m) => sum + m.amount, 0)
    }
  })
  const categoryComparison = categories.filter(c => c.kind === 'expense').map(c => ({
    category: c.name,
    current: analyticsMovements.filter(m => m.kind === 'expense' && m.category === c.name && monthKey(m.date) === month).reduce((sum, m) => sum + m.amount, 0),
    previous: analyticsMovements.filter(m => m.kind === 'expense' && m.category === c.name && monthKey(m.date) === previousMonth).reduce((sum, m) => sum + m.amount, 0)
  })).filter(c => c.current > 0 || c.previous > 0).sort((a, b) => (b.current + b.previous) - (a.current + a.previous))
  const previousMonthName = new Intl.DateTimeFormat('es-AR', { month: 'long' }).format(previousMonthDate)
  const chartColors = ['#477b5c', '#8eaa91', '#c3a477', '#8a9bb5', '#c1846b', '#9a8ab2', '#a8aaa0', '#6b9da0', '#bd9caa', '#84916d']
  const filtered = movements.filter(m => (filter === 'Todos' || m.person === filter) && (m.concept.toLowerCase().includes(search.toLowerCase()) || m.category.toLowerCase().includes(search.toLowerCase()))).sort((a, b) => b.date.localeCompare(a.date))

  function notify(message: string) { setToast(message); window.setTimeout(() => setToast(''), 2400) }
  async function registerPasskey() {
    if (!supabase) return
    if (!window.isSecureContext || !window.PublicKeyCredential) { notify('Este navegador no admite passkeys en este contexto.'); return }
    setPasskeyBusy(true)
    const { data, error } = await supabase.auth.registerPasskey()
    setPasskeyBusy(false)
    if (error) { notify('No se pudo registrar: ' + error.message); return }
    notify('Passkey registrada correctamente en este dispositivo')
    return data
  }
  async function saveMovement(m: Movement) {
    if (!supabase) return
    const categoryId = categories.find(c => c.name === m.category && c.kind === m.kind)?.id
    if (!categoryId) { notify('Elegí una categoría válida'); return }
    const payload = { household_id: household.id, category_id: categoryId, type: m.kind, concept: m.concept, amount: m.amount, movement_date: m.date, person: m.person, comment: m.comment ?? null }
    const result = editing
      ? await supabase.from('movements').update(payload).eq('id', m.id).eq('household_id', household.id)
      : await supabase.from('movements').insert({ ...payload, recorded_by: userId })
    if (result.error) { notify('Error al guardar: ' + result.error.message); return }
    setMovements(current => editing ? current.map(x => x.id === m.id ? m : x) : [{ ...m, recordedBy: userId }, ...current])
    setModal(false); setEditing(null); notify(editing ? 'Movimiento actualizado' : 'Movimiento agregado')
  }
  async function saveAssistantMovement(draft: { date: string; kind: Kind; concept: string; category: string; person: Person; amount: number; comment?: string }): Promise<boolean> {
    if (!supabase) return false
    const categoryId = categories.find(c => c.name === draft.category && c.kind === draft.kind)?.id
    if (!categoryId) { notify('No encontré una categoría válida para ese movimiento.'); return false }
    const payload = {
      household_id: household.id,
      category_id: categoryId,
      type: draft.kind,
      concept: draft.concept,
      amount: draft.amount,
      movement_date: draft.date,
      person: draft.person,
      comment: draft.comment ?? null,
      recorded_by: userId
    }
    const { data, error } = await supabase.from('movements').insert(payload).select('id').single()
    if (error || !data) { notify('No se pudo registrar: ' + (error?.message ?? 'Error desconocido')); return false }
    setMovements(current => [{ id: data.id, date: draft.date, kind: draft.kind, concept: draft.concept, category: draft.category, person: draft.person, amount: draft.amount, comment: draft.comment, recordedBy: userId }, ...current])
    notify('Movimiento registrado por el asistente')
    return true
  }
  async function createInstallmentPlan(input: { concept: string; category: string; person: Person; purchaseTotal: number; financedTotal: number; count: number; firstDueDate: string; comment: string }) {
    if (!supabase) return
    const categoryId = categories.find(c => c.name === input.category && c.kind === 'expense')?.id
    if (!categoryId) { notify('Elegí una categoría válida'); return }

    const { data, error } = await supabase.rpc('create_installment_plan', {
      p_household_id: household.id,
      p_concept: input.concept.trim(),
      p_category_id: categoryId,
      p_person: input.person,
      p_purchase_total: input.purchaseTotal,
      p_financed_total: input.financedTotal,
      p_installment_count: input.count,
      p_first_due_date: input.firstDueDate,
      p_comment: input.comment.trim() || null
    })

    if (error || !data) {
      notify('No se pudo registrar la compra en cuotas: ' + (error?.message ?? 'No se recibió una confirmación del servidor.'))
      return
    }

    const created = data as {
      plan_id: string
      movements: Array<{ id: string; movement_date: string; amount: number; installment_number: number }>
      installments: Installment[]
    }
    const newMovements: Movement[] = created.movements.map(m => ({
      id: m.id,
      date: m.movement_date,
      kind: 'expense',
      concept: input.concept.trim() + ' (' + m.installment_number + '/' + input.count + ')',
      category: input.category,
      person: input.person,
      amount: Number(m.amount),
      comment: input.comment.trim() || undefined,
      recordedBy: userId
    }))
    setMovements(current => [...newMovements, ...current])
    setPlans(current => [...current, {
      id: created.plan_id,
      concept: input.concept.trim(),
      person: input.person,
      purchase_total: input.purchaseTotal,
      financed_total: input.financedTotal,
      installment_count: input.count,
      first_due_date: input.firstDueDate,
      status: 'active'
    }])
    setInstallments(current => [...current, ...created.installments])
    setInstallmentForm(false)
    notify('Compra en cuotas registrada')
  }
  async function toggleInstallment(item: Installment) {
    if (!supabase) return
    const next = item.status === 'paid' ? 'pending' : 'paid'
    const { error } = await supabase.from('installments').update({ status: next, paid_at: next === 'paid' ? new Date().toISOString() : null }).eq('id', item.id).eq('household_id', household.id)
    if (error) { notify('No se pudo actualizar: ' + error.message); return }
    setInstallments(current => current.map(x => x.id === item.id ? { ...x, status: next } : x))
    notify(next === 'paid' ? 'Cuota marcada como pagada' : 'Cuota marcada como pendiente')
  }
  async function removeMovement(id: string) {
    if (!supabase || deleting) return
    setDeleting(true)
    const { error } = await supabase.rpc('delete_movement', { p_movement_id: id })
    setDeleting(false)
    if (error) { notify('Error al eliminar: ' + error.message); return }
    // Mantener al usuario en Movimientos y actualizar el estado local sin recargar la app.
    const relatedInstallments = installments.filter(item => item.movement_id === id)
    const planId = relatedInstallments[0]?.plan_id

    if (planId) {
      const deletedMovementIds = new Set(
        installments.filter(item => item.plan_id === planId).map(item => item.movement_id)
      )
      setMovements(current => current.filter(item => !deletedMovementIds.has(item.id)))
      setInstallments(current => current.filter(item => item.plan_id !== planId))
      setPlans(current => current.filter(plan => plan.id !== planId))
    } else {
      setMovements(current => current.filter(item => item.id !== id))
    }
    setDeleteTarget(null)
    notify('Movimiento eliminado correctamente')
  }
  function changeMonth(delta: number) { const d = new Date(month + '-15T12:00:00'); d.setMonth(d.getMonth() + delta); setMonth(monthKey(d.toISOString())) }
  function exportCsv() {
    const rows = [['Fecha', 'Tipo', 'Concepto', 'Categoría', 'Persona', 'Monto', 'Comentario'], ...movements.map(m => [m.date, m.kind === 'income' ? 'Ingreso' : 'Gasto', m.concept, m.category, m.person, String(m.amount), m.comment ?? ''])]
    const csv = rows.map(row => row.map(v => '"' + v.replace(/"/g, '""') + '"').join(';')).join('\n')
    const url = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a'); a.href = url; a.download = 'enquegasto-movimientos.csv'; a.click(); URL.revokeObjectURL(url)
  }
  const monthName = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' }).format(new Date(month + '-15T12:00:00'))

  if (dataLoading) return <div className="auth-screen"><div className="auth-card"><div className="brand-mark"><Wallet size={21} /></div><p>Cargando movimientos compartidos...</p></div></div>
  if (dataError) return <div className="auth-screen"><div className="auth-card"><h1>No pudimos cargar tus datos</h1><p>{dataError}</p><button className="primary-button auth-submit" onClick={() => window.location.reload()}>Reintentar</button><button className="auth-toggle" onClick={onSignOut}>Cerrar sesión</button></div></div>
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><Wallet size={21} /></div><div><strong>EnQuéGasto</strong><span>Finanzas compartidas</span></div></div>
      <div className="workspace-label">TU ESPACIO</div>
      <nav>{nav.map(item => <button key={item.id} className={page === item.id ? 'nav-item active' : 'nav-item'} onClick={() => setPage(item.id)}><item.icon size={18} /><span>{item.label}</span>{item.id === 'movements' && <span className="nav-count">{movements.length}</span>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="couple-avatar"><span>A</span><span>C</span></div><div className="couple-copy"><strong>Agus y Camila</strong><span>Hogar compartido</span></div><ChevronDown size={15} className="muted-icon" /></div>
    </aside>
    <main className="main-area">
      <header className="topbar"><div className="breadcrumb">Finanzas <span>/</span> <strong>{nav.find(n => n.id === page)?.label}</strong></div><div className="top-actions"><span className="local-pill"><span className="status-dot" /> Sincronizado</span><button className="icon-button theme-toggle" title={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'} aria-label={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'} onClick={() => setTheme(current => current === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}</button><button className="icon-button" title="Ayuda"><CircleHelp size={18} /></button><button className="user-avatar signout-avatar" title="Cerrar sesión" onClick={onSignOut}>A</button></div></header>
      <div className="page-content">
        {page === 'home' && <><div className="page-heading"><div><div className="eyebrow">TU ECONOMÍA, EN CLARO</div><h1>Resumen</h1><p>Así se mueve la economía de tu hogar.</p></div><div className="page-heading-actions"><button className="secondary-button assistant-shortcut" onClick={() => setPage('assistant')}><Bot size={17} /> Asistente</button><div className="page-heading-actions"><button className="secondary-button assistant-shortcut" onClick={() => setPage('assistant')}><Bot size={17} /> Asistente</button><button className="primary-button" onClick={() => { setEditing(null); setModal(true) }}><Plus size={17} /> Nuevo movimiento</button></div></div></div>
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
        {page === 'dashboards' && <>
          <div className="page-heading"><div><div className="eyebrow">ANÁLISIS DEL HOGAR</div><h1>Dashboards</h1><p>Entendé cómo se mueven sus ingresos y gastos.</p></div></div>
          <div className="analytics-toolbar">
            <div className="month-control analytics-month-control"><button className="icon-button" onClick={() => changeMonth(-1)}><ArrowLeft size={17} /></button><CalendarDays size={16} /><span>{monthName}</span><button className="icon-button" onClick={() => changeMonth(1)}><ArrowRight size={17} /></button><button className="text-button" onClick={() => setMonth(monthKey(today))}>Este mes</button></div>
            <label className="analytics-person-filter">Persona <select value={analyticsPerson} onChange={e => setAnalyticsPerson(e.target.value)}><option>Todos</option><option>Agus</option><option>Camila</option><option>Compartido</option></select></label>
          </div>
          <section className="analytics-grid">
            <div className="panel analytics-panel"><div className="panel-heading"><div><h2>Gastos por categoría</h2><p>Distribución del mes seleccionado</p></div></div>
              {expensePieData.length ? <><div className="chart-wrap"><ResponsiveContainer width="100%" height={250}><PieChart><Pie data={expensePieData} dataKey="total" nameKey="name" innerRadius={58} outerRadius={88} paddingAngle={2}>{expensePieData.map((entry, index) => <Cell key={entry.name} fill={chartColors[index % chartColors.length]} />)}</Pie><Tooltip formatter={(value) => money(Number(value))} /><Legend verticalAlign="bottom" height={42} wrapperStyle={{ fontSize: '10px' }} /></PieChart></ResponsiveContainer></div><div className="chart-total"><span>Total de gastos</span><strong>{money(expensePieData.reduce((sum, item) => sum + item.total, 0))}</strong></div></> : <EmptyState text="Todavía no hay gastos para este período." />}
            </div>
            <div className="panel analytics-panel"><div className="panel-heading"><div><h2>Ingresos por categoría</h2><p>Distribución del mes seleccionado</p></div></div>
              {incomePieData.length ? <><div className="chart-wrap"><ResponsiveContainer width="100%" height={250}><PieChart><Pie data={incomePieData} dataKey="total" nameKey="name" innerRadius={58} outerRadius={88} paddingAngle={2}>{incomePieData.map((entry, index) => <Cell key={entry.name} fill={chartColors[index % chartColors.length]} />)}</Pie><Tooltip formatter={(value) => money(Number(value))} /><Legend verticalAlign="bottom" height={42} wrapperStyle={{ fontSize: '10px' }} /></PieChart></ResponsiveContainer></div><div className="chart-total"><span>Total de ingresos</span><strong>{money(incomePieData.reduce((sum, item) => sum + item.total, 0))}</strong></div></> : <EmptyState text="Todavía no hay ingresos para este período." />}
            </div>
            <div className="panel analytics-panel analytics-wide"><div className="panel-heading"><div><h2>Evolución mensual de gastos</h2><p>Últimos seis meses hasta {monthName}</p></div></div>
              {trendData.some(item => item.expenses > 0) ? <div className="chart-wrap chart-tall"><ResponsiveContainer width="100%" height={290}><LineChart data={trendData} margin={{ top: 10, right: 18, left: 8, bottom: 4 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#edf0eb" /><XAxis dataKey="month" tick={{ fontSize: 10, fill: '#89938b' }} axisLine={false} tickLine={false} /><YAxis tickFormatter={(value) => value >= 1000000 ? '$' + (value / 1000000).toFixed(1) + 'M' : '$' + Math.round(value / 1000) + 'k'} tick={{ fontSize: 9, fill: '#89938b' }} axisLine={false} tickLine={false} width={58} /><Tooltip formatter={(value) => money(Number(value))} /><Line type="monotone" dataKey="expenses" name="Gastos" stroke="#477b5c" strokeWidth={3} dot={{ r: 4, fill: '#477b5c' }} activeDot={{ r: 6 }} /></LineChart></ResponsiveContainer></div> : <EmptyState text="Cuando haya gastos registrados, vas a ver la evolución mensual." />}
            </div>
            <div className="panel analytics-panel analytics-wide"><div className="panel-heading"><div><h2>Comparativa de categorías</h2><p>{monthName} frente a {previousMonthName}</p></div></div>
              {categoryComparison.length ? <div className="chart-wrap chart-tall"><ResponsiveContainer width="100%" height={Math.max(280, categoryComparison.length * 46)}><BarChart data={categoryComparison} layout="vertical" margin={{ top: 5, right: 18, left: 12, bottom: 5 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#edf0eb" /><XAxis type="number" tickFormatter={(value) => value >= 1000000 ? '$' + (value / 1000000).toFixed(1) + 'M' : '$' + Math.round(value / 1000) + 'k'} tick={{ fontSize: 9, fill: '#89938b' }} axisLine={false} tickLine={false} /><YAxis type="category" dataKey="category" width={112} tick={{ fontSize: 10, fill: '#68736a' }} axisLine={false} tickLine={false} /><Tooltip formatter={(value) => money(Number(value))} /><Legend wrapperStyle={{ fontSize: '10px' }} /><Bar dataKey="previous" name={previousMonthName} fill="#c9d5ca" radius={[0, 4, 4, 0]} barSize={10} /><Bar dataKey="current" name={monthName} fill="#477b5c" radius={[0, 4, 4, 0]} barSize={10} /></BarChart></ResponsiveContainer></div> : <EmptyState text="No hay gastos para comparar entre estos dos meses." />}
            </div>
          </section>
        </>}
        {page === 'movements' && <>
          <div className="page-heading"><div><div className="eyebrow">REGISTRO</div><h1>Movimientos</h1><p>Ingresos y gastos de ustedes dos.</p></div><button className="primary-button" onClick={() => { setEditing(null); setModal(true) }}><Plus size={17} /> Nuevo movimiento</button></div>
          <div className="toolbar"><div className="search-box"><Search size={17} /><input placeholder="Buscar concepto o categoría..." value={search} onChange={e => setSearch(e.target.value)} /></div><div className="filter-wrap"><ListFilter size={16} /><select value={filter} onChange={e => setFilter(e.target.value)}><option>Todos</option><option>Agus</option><option>Camila</option><option>Compartido</option></select></div><button className="subtle-button export-button" onClick={exportCsv}><Download size={16} /> Exportar</button></div>
          <div className="panel table-panel">{filtered.length ? <div className="table-scroll"><table><thead><tr><th>Movimiento</th><th>Persona</th><th>Fecha</th><th className="align-right">Importe</th><th></th></tr></thead><tbody>{filtered.map(m => <tr key={m.id}><td><div className="table-concept"><span className={m.kind === 'income' ? 'mini-kind income-kind' : 'mini-kind expense-kind'}>{m.kind === 'income' ? <ArrowDownLeft size={15} /> : <ArrowUpRight size={15} />}</span><div><strong>{m.concept}</strong><small>{m.category}{m.comment ? ' · ' + m.comment : ''}</small></div></div></td><td><PersonTag person={m.person} /></td><td className="date-cell">{dateLabel(m.date)}</td><td className={m.kind === 'income' ? 'align-right amount-income' : 'align-right amount-expense'}>{m.kind === 'income' ? '+' : '−'}{money(m.amount)}</td><td><div className="row-actions"><button className="icon-button small" title="Editar" onClick={() => { setEditing(m); setModal(true) }}><SlidersHorizontal size={15} /></button><button className="icon-button small danger-hover" title="Eliminar" onClick={() => setDeleteTarget(m)}><Trash2 size={15} /></button></div></td></tr>)}</tbody></table></div> : <EmptyState text="No encontramos movimientos con esos filtros." />}</div>
        </>}
        {page === 'assistant' && <AssistantPanel categories={categories} onSave={saveAssistantMovement} />}
        {page === 'installments' && <InstallmentsPage plans={plans} installments={installments} onCreate={() => setInstallmentForm(true)} onToggle={toggleInstallment} />}
        {page === 'categories' && <><div className="page-heading"><div><div className="eyebrow">ORGANIZACIÓN</div><h1>Categorías</h1><p>Organizá los movimientos a tu manera.</p></div><button className="primary-button" onClick={async () => { const name = window.prompt('Nombre de la categoría'); if (!supabase || !name?.trim() || categories.some(c => c.name.toLowerCase() === name.trim().toLowerCase())) return; const { data, error } = await supabase.from('categories').insert({ household_id: household.id, name: name.trim(), type: 'expense', is_default: false }).select('id,name,type').single(); if (error) notify('Error: ' + error.message); else { setCategories([...categories, { id: data.id, name: data.name, kind: data.type as Kind }]); notify('Categoría creada') } }}><Plus size={17} /> Nueva categoría</button></div>
          <div className="category-columns"><CategoryGroup title="Gastos" kind="expense" categories={categories} onDelete={async name => { const category = categories.find(c => c.name === name); if (!category || !supabase) return; const { error } = await supabase.from('categories').delete().eq('id', category.id).eq('household_id', household.id); if (error) notify('No se pudo eliminar: puede tener movimientos asociados.'); else { setCategories(categories.filter(c => c.id !== category.id)); notify('Categoría eliminada') } }} /><CategoryGroup title="Ingresos" kind="income" categories={categories} onDelete={name => setCategories(categories.filter(c => c.name !== name))} /></div>
        </>}
        {page === 'settings' && <><div className="page-heading"><div><div className="eyebrow">PREFERENCIAS</div><h1>Ajustes</h1><p>Configuración de tu espacio compartido.</p></div></div><div className="panel settings-panel"><div className="settings-row"><div className="settings-symbol"><Wallet size={19} /></div><div><strong>Hogar compartido</strong><p>Agus y Camila</p></div><span className="settings-value">Espacio personal</span></div><div className="settings-row"><div className="settings-symbol"><Fingerprint size={19} /></div><div><strong>Ingreso con huella o Face ID</strong><p>Registrá una passkey en este dispositivo para entrar sin escribir tu contraseña.</p></div><button className="subtle-button" onClick={registerPasskey} disabled={passkeyBusy}>{passkeyBusy ? 'Registrando...' : 'Configurar'} <ArrowRight size={15} /></button></div><div className="settings-row"><div className="settings-symbol"><Download size={19} /></div><div><strong>Exportar movimientos</strong><p>Descargá tus registros en formato CSV para abrirlos en Excel.</p></div><button className="subtle-button" onClick={exportCsv}>Exportar <ArrowRight size={15} /></button></div><div className="settings-row"><div className="settings-symbol"><Activity size={19} /></div><div><strong>Almacenamiento</strong><p>Movimientos y categorías guardados en el hogar compartido de Supabase.</p></div><span className="settings-value">Compartido</span></div></div></>}
      </div>
      <footer className="footer"><span>EnQuéGasto <span className="footer-dot">·</span> Hecho para organizar lo cotidiano.</span><span>Versión inicial 0.1</span></footer>
    </main>
    {installmentForm && <InstallmentModal categories={categories} onClose={() => setInstallmentForm(false)} onSave={createInstallmentPlan} />}
    {modal && <MovementModal categories={categories} editing={editing} onClose={() => { setModal(false); setEditing(null) }} onSave={saveMovement} />}
    {deleteTarget && <div className="modal-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget && !deleting) setDeleteTarget(null) }}>
      <section className="modal confirm-modal" role="dialog" aria-modal="true" aria-labelledby="delete-dialog-title">
        <div className="confirm-icon"><Trash2 size={21} /></div>
        <div className="confirm-copy">
          <div className="eyebrow">CONFIRMAR ELIMINACIÓN</div>
          <h2 id="delete-dialog-title">¿Eliminar este movimiento?</h2>
          <p className="confirm-concept">{deleteTarget.concept}</p>
          <div className="confirm-details"><span>{deleteTarget.kind === 'income' ? 'Ingreso' : 'Gasto'}</span><strong>{money(deleteTarget.amount)}</strong><span>{dateLabel(deleteTarget.date)}</span></div>
          <p className="confirm-warning">{installments.some(item => item.movement_id === deleteTarget.id) ? 'Esta operación pertenece a una compra en cuotas. Se eliminarán la compra financiada, todos sus movimientos y todas sus cuotas.' : 'Esta acción no se puede deshacer. El movimiento se eliminará definitivamente.'}</p>
        </div>
        <div className="modal-footer confirm-actions">
          <button className="secondary-button" type="button" onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancelar</button>
          <button className="danger-button" type="button" onClick={() => removeMovement(deleteTarget.id)} disabled={deleting}><Trash2 size={15}/>{deleting ? 'Eliminando...' : 'Sí, eliminar'}</button>
        </div>
      </section>
    </div>}
    {toast && <div className="toast"><Check size={16} />{toast}</div>}
  </div>
}

function InstallmentsPage({ plans, installments, onCreate, onToggle }: { plans: any[]; installments: Installment[]; onCreate: () => void; onToggle: (item: Installment) => void }) {
  const pending = installments.filter(i => i.status === 'pending')
  const paid = installments.filter(i => i.status === 'paid')
  const debt = pending.reduce((sum, i) => sum + i.amount, 0)
  const next = [...pending].sort((a, b) => a.due_date.localeCompare(b.due_date))
  return <>
    <div className="page-heading"><div><div className="eyebrow">COMPROMISOS FUTUROS</div><h1>Cuotas</h1><p>Compras financiadas, pagos y deuda pendiente.</p></div><button className="primary-button" onClick={onCreate}><Plus size={17}/> Nueva compra en cuotas</button></div>
    <section className="stat-grid installment-stats">
      <div className="stat-card"><div className="stat-top"><span>Deuda pendiente</span><CalendarDays size={17}/></div><strong>{money(debt)}</strong><small>Saldo de cuotas por pagar</small></div>
      <div className="stat-card"><div className="stat-top"><span>Cuotas pendientes</span></div><strong>{pending.length}</strong><small>De todas las compras activas</small></div>
      <div className="stat-card"><div className="stat-top"><span>Cuotas pagadas</span></div><strong>{paid.length}</strong><small>Marcadas como abonadas</small></div>
    </section>
    <div className="panel installment-panel"><div className="panel-heading"><div><h2>Próximos vencimientos</h2><p>Marcá cada cuota cuando la hayas pagado.</p></div></div>
      {next.length ? <div className="installment-list">{next.map(i => { const plan = plans.find(p => p.id === i.plan_id); return <div className="installment-row" key={i.id}><div className="installment-date"><strong>{dateLabel(i.due_date)}</strong><small>Cuota {i.installment_number} de {plan?.installment_count ?? '—'}</small></div><div className="installment-main"><strong>{plan?.concept ?? 'Compra financiada'}</strong><small>{plan?.person ?? 'Compartido'}</small></div><strong className="installment-amount">{money(i.amount)}</strong><button className="subtle-button installment-paid" onClick={() => onToggle(i)}><Check size={15}/> Pagar</button></div> })}</div> : <EmptyState text="No tenés cuotas pendientes. Cuando registres una compra financiada, aparecerá acá." />}
    </div>
    {paid.length > 0 && <div className="panel installment-panel"><div className="panel-heading"><div><h2>Cuotas pagadas</h2><p>Historial de pagos registrados.</p></div></div><div className="installment-list">{paid.map(i => { const plan = plans.find(p => p.id === i.plan_id); return <div className="installment-row paid-row" key={i.id}><div className="installment-date"><strong>{dateLabel(i.due_date)}</strong><small>Cuota {i.installment_number} de {plan?.installment_count ?? '—'}</small></div><div className="installment-main"><strong>{plan?.concept ?? 'Compra financiada'}</strong><small>{plan?.person ?? 'Compartido'}</small></div><strong className="installment-amount">{money(i.amount)}</strong><button className="text-button" onClick={() => onToggle(i)}>Deshacer</button></div> })}</div></div>}
    {plans.length > 0 && <div className="panel installment-panel"><div className="panel-heading"><div><h2>Compras financiadas</h2><p>Resumen de cada plan de cuotas.</p></div></div><div className="plan-grid">{plans.map(p => { const items = installments.filter(i => i.plan_id === p.id); const remaining = items.filter(i => i.status === 'pending').reduce((sum, i) => sum + i.amount, 0); return <div className="plan-card" key={p.id}><strong>{p.concept}</strong><small>{p.person} · {p.installment_count} cuotas</small><div className="plan-numbers"><span>Compra: {money(Number(p.purchase_total))}</span><span>Financiado: {money(Number(p.financed_total))}</span></div><div className="plan-progress"><div style={{width: (items.length ? (items.filter(i=>i.status==='paid').length/items.length)*100 : 0)+'%'}}/></div><small>Restante: <b>{money(remaining)}</b></small></div> })}</div></div>}
  </>
}
function InstallmentModal({ categories, onClose, onSave }: { categories: Category[]; onClose: () => void; onSave: (input: { concept: string; category: string; person: Person; purchaseTotal: number; financedTotal: number; count: number; firstDueDate: string; comment: string }) => void }) {
  const [concept,setConcept]=useState('')
  const [category,setCategory]=useState(categories.find(c=>c.kind==='expense')?.name ?? '')
  const [person,setPerson]=useState<Person>('Compartido')
  const [purchaseTotal,setPurchaseTotal]=useState('')
  const [financedTotal,setFinancedTotal]=useState('')
  const [count,setCount]=useState('3')
  const [firstDueDate,setFirstDueDate]=useState(today)
  const [comment,setComment]=useState('')
  const total=Number(financedTotal || purchaseTotal)
  const installmentsCount=Math.max(2,Number(count)||2)
  const estimated=total/installmentsCount
  return <div className="modal-backdrop"><form className="modal installment-modal" onSubmit={e=>{e.preventDefault();const purchase=Number(purchaseTotal);const financed=Number(financedTotal || purchaseTotal);const n=Number(count);if(concept.trim()&&category&&purchase>0&&financed>0&&n>=2&&n<=120)onSave({concept:concept.trim(),category,person,purchaseTotal:purchase,financedTotal:financed,count:n,firstDueDate,comment:comment.trim()})}}>
    <div className="modal-header"><div><div className="eyebrow">NUEVA COMPRA FINANCIADA</div><h2>Registrar cuotas</h2></div><button type="button" className="icon-button" onClick={onClose}><X size={19}/></button></div>
    <label className="field-label">¿Qué compraste?<input autoFocus required value={concept} onChange={e=>setConcept(e.target.value)} placeholder="Ej. Heladera, celular..."/></label>
    <div className="field-grid"><label className="field-label">Precio de compra<input type="number" min="0.01" step="0.01" required value={purchaseTotal} onChange={e=>{setPurchaseTotal(e.target.value);if(!financedTotal)setFinancedTotal(e.target.value)}} placeholder="0"/></label><label className="field-label">Total financiado<input type="number" min="0.01" step="0.01" required value={financedTotal} onChange={e=>setFinancedTotal(e.target.value)} placeholder="Igual al precio si no hay interés"/></label></div>
    <div className="field-grid"><label className="field-label">Cantidad de cuotas<input type="number" min="2" max="120" required value={count} onChange={e=>setCount(e.target.value)}/></label><label className="field-label">Primera cuota<input type="date" required value={firstDueDate} onChange={e=>setFirstDueDate(e.target.value)}/></label></div>
    <div className="field-grid"><label className="field-label">Categoría<select value={category} onChange={e=>setCategory(e.target.value)}>{categories.filter(c=>c.kind==='expense').map(c=><option key={c.id} value={c.name}>{c.name}</option>)}</select></label><label className="field-label">¿De quién es?<select value={person} onChange={e=>setPerson(e.target.value as Person)}><option>Compartido</option><option>Agus</option><option>Camila</option></select></label></div>
    <label className="field-label">Comentario <span className="optional">(opcional)</span><input value={comment} onChange={e=>setComment(e.target.value)} placeholder="Ej. 6 cuotas sin interés"/></label>
    <div className="installment-preview"><span>{installmentsCount} cuotas estimadas</span><strong>{money(estimated)} por mes</strong><small>Financiado: {money(total)} · {total>Number(purchaseTotal)?'Incluye intereses':'Sin intereses adicionales'}</small></div>
    <div className="modal-footer"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" type="submit"><Check size={16}/> Crear cuotas</button></div>
  </form></div>
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
  const [person, setPerson] = useState<Person>(editing?.person ?? (localStorage.getItem('enquegasto-last-person') as Person | null) ?? 'Compartido')
  const [date, setDate] = useState(editing?.date ?? today)
  const [comment, setComment] = useState(editing?.comment ?? '')
  const [showDetails, setShowDetails] = useState(Boolean(editing))
  const availableCategories = categories.filter(c => c.kind === kind)
  useEffect(() => {
    if (!availableCategories.some(c => c.name === category)) setCategory(availableCategories[0]?.name ?? '')
  }, [kind, categories])
  function suggestCategory(value: string) {
    const text = value.toLowerCase()
    const rules: [string[], string][] = [
      [['super','carrefour','coto','dia','verduler','almacen','kiosco'], 'Supermercado'],
      [['nafta','combustible','sube','uber','cabify','taxi','colectivo'], 'Transporte'],
      [['farmacia','medicamento','consulta','medico','médico'], 'Salud'],
      [['alquiler'], 'Alquiler'],
      [['expensas'], 'Expensas'],
      [['luz','electricidad','edenor','edesur','internet','wifi','agua','gas'], 'Servicios'],
      [['restaurant','restaurante','cafe','café','bar','delivery','pedido'], 'Gastronomía'],
      [['ropa','zapatilla','remera','pantalon','pantalón'], 'Indumentaria'],
      [['mueble','decoracion','decoración','ferreteria','ferretería'], 'Hogar']
    ]
    const match = rules.find(([words, name]) => availableCategories.some(c => c.name === name) && words.some(word => text.includes(word)))
    if (match) setCategory(match[1])
  }
  function submit(e: FormEvent) {
    e.preventDefault()
    const value = Number(amount.replace(',', '.'))
    if (!concept.trim() || !Number.isFinite(value) || value <= 0 || !category) return
    localStorage.setItem('enquegasto-last-person', person)
    onSave({ id: editing?.id ?? crypto.randomUUID(), date, kind, concept: concept.trim(), category, person, amount: value, comment: comment.trim() || undefined, recordedBy: 'Agus' })
  }
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}><form className="modal quick-modal" onSubmit={submit}>
    <div className="modal-header"><div><div className="eyebrow">{editing ? 'ACTUALIZAR REGISTRO' : 'CARGA RÁPIDA'}</div><h2>{editing ? 'Editar movimiento' : '¿Qué registramos?'}</h2></div><button type="button" className="icon-button" onClick={onClose}><X size={19} /></button></div>
    <div className="kind-switch"><button type="button" className={kind === 'expense' ? 'selected expense-selected' : ''} onClick={() => setKind('expense')}><ArrowUpRight size={16} /> Gasto</button><button type="button" className={kind === 'income' ? 'selected income-selected' : ''} onClick={() => setKind('income')}><ArrowDownLeft size={16} /> Ingreso</button></div>
    <label className="field-label quick-amount-label">¿Cuánto? <div className="amount-input"><span>$</span><input autoFocus type="number" min="1" step="0.01" inputMode="decimal" placeholder="0" value={amount} onChange={e => setAmount(e.target.value)} required /></div></label>
    <label className="field-label">¿En qué fue? <input placeholder="Ej. Supermercado, nafta, sueldo..." value={concept} onChange={e => { setConcept(e.target.value); suggestCategory(e.target.value) }} required /></label>
    <button type="button" className="details-toggle" onClick={() => setShowDetails(!showDetails)}><SlidersHorizontal size={14} /> {showDetails ? 'Ocultar detalles' : 'Agregar detalles (opcional)'} <ChevronDown size={14} className={showDetails ? 'rotate-chevron' : ''} /></button>
    {showDetails && <div className="quick-details">
      <div className="field-grid"><label className="field-label">Categoría sugerida<select value={category} onChange={e => setCategory(e.target.value)} required>{availableCategories.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}</select></label><label className="field-label">¿De quién es?<select value={person} onChange={e => setPerson(e.target.value as Person)}><option>Compartido</option><option>Agus</option><option>Camila</option></select></label></div>
      <div className="field-grid"><label className="field-label">Fecha<input type="date" value={date} onChange={e => setDate(e.target.value)} required /></label><label className="field-label">Comentario <span className="optional">(opcional)</span><input placeholder="Un detalle..." value={comment} onChange={e => setComment(e.target.value)} /></label></div>
    </div>}
    <div className="quick-hint">La fecha y la categoría se completan automáticamente. Podés cambiarlas cuando quieras.</div>
    <div className="modal-footer"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" type="submit"><Check size={16} /> {editing ? 'Guardar cambios' : 'Guardar gasto'}</button></div>
  </form></div>
}

// Se conserva el panel anterior mientras se conecta su persistencia compartida.
void FinanceApp
void HouseholdReady

type Household = { id: string; name: string }

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [household, setHousehold] = useState<Household | null>(null)
  const [householdLoading, setHouseholdLoading] = useState(false)
  const [householdError, setHouseholdError] = useState('')
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [passkeyBusy, setPasskeyBusy] = useState(false)

  useEffect(() => {
    if (!supabase) { setLoading(false); return }
    supabase.auth.getSession().then(({ data, error }) => {
      if (error) setAuthError(error.message)
      setSession(data.session)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession))
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!supabase || !session) { setHousehold(null); return }
    let active = true
    setHouseholdLoading(true)
    setHouseholdError('')
    supabase.rpc('get_my_household').then(({ data, error }) => {
      if (!active) return
      if (error) setHouseholdError(error.message)
      else setHousehold((data?.[0] as Household | undefined) ?? null)
      setHouseholdLoading(false)
    })
    return () => { active = false }
  }, [session?.user.id])

  async function createHousehold(name: string) {
    if (!supabase) return
    setHouseholdError('')
    const { data, error } = await supabase.rpc('create_household', { household_name: name })
    if (error) { setHouseholdError(error.message); return }
    setHousehold({ id: data as string, name })
  }

  async function submitAuth(event: FormEvent) {
    event.preventDefault()
    if (!supabase) return
    setBusy(true); setAuthError(''); setMessage('')
    const result = mode === 'signup'
      ? await supabase.auth.signUp({ email: email.trim(), password })
      : await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (result.error) { setAuthError(result.error.message); return }
    if (mode === 'signup' && !result.data.session) setMessage('Te enviamos un correo para confirmar tu cuenta. Después vas a poder iniciar sesión.')
  }

  async function signInPasskey() {
    if (!supabase) return
    if (!window.isSecureContext || !window.PublicKeyCredential) { setAuthError('Este navegador no admite passkeys en este contexto.'); return }
    setPasskeyBusy(true); setAuthError(''); setMessage('')
    const { data, error } = await supabase.auth.signInWithPasskey()
    setPasskeyBusy(false)
    if (error) { setAuthError(error.message); return }
    if (data.session) setSession(data.session)
  }

  async function signOut() {
    if (!supabase) return
    await supabase.auth.signOut()
    setSession(null)
  }

  if (loading) return <div className="auth-screen"><div className="auth-card"><div className="brand-mark"><Wallet size={21} /></div><p>Conectando con tu espacio...</p></div></div>
  if (!isSupabaseConfigured || !supabase) return <div className="auth-screen"><div className="auth-card"><div className="brand-mark"><Wallet size={21} /></div><h1>EnQuéGasto</h1><p>La conexión con Supabase todavía no está configurada. Revisá las variables de GitHub Actions y volvé a publicar.</p></div></div>
  if (!session) return <div className="auth-screen"><form className="auth-card" onSubmit={submitAuth}>
    <div className="auth-brand"><div className="brand-mark"><Wallet size={21} /></div><div><strong>EnQuéGasto</strong><span>Finanzas compartidas</span></div></div>
    <div className="eyebrow">{mode === 'login' ? 'TU ESPACIO, EN ORDEN' : 'EMPEZÁ A ORGANIZARTE'}</div>
    <h1>{mode === 'login' ? 'Bienvenido de nuevo' : 'Crear cuenta'}</h1>
    <p>{mode === 'login' ? 'Ingresá para acceder a tus finanzas.' : 'Registrate con tu correo para empezar.'}</p>
    <label className="field-label">Correo electrónico<input type="email" autoComplete="email" placeholder="tu@email.com" value={email} onChange={e => setEmail(e.target.value)} required /></label>
    <label className="field-label">Contraseña<input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder="Al menos 6 caracteres" minLength={6} value={password} onChange={e => setPassword(e.target.value)} required /></label>
    {authError && <div className="auth-error">{authError}</div>}
    {message && <div className="auth-message">{message}</div>}
    <button className="primary-button auth-submit" type="submit" disabled={busy}>{busy ? 'Un momento...' : mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}</button>
    {mode === 'login' && <><div className="auth-divider"><span>o también</span></div><button className="secondary-button auth-passkey" type="button" onClick={signInPasskey} disabled={passkeyBusy}><Fingerprint size={17} /> {passkeyBusy ? 'Esperando verificación...' : 'Ingresar con huella o Face ID'}</button></>}
    <button className="auth-toggle" type="button" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setAuthError(''); setMessage('') }}>{mode === 'login' ? '¿No tenés cuenta? Crear una' : '¿Ya tenés cuenta? Iniciar sesión'}</button>
  </form></div>
  if (householdLoading) return <div className="auth-screen"><div className="auth-card"><div className="brand-mark"><Wallet size={21} /></div><p>Buscando tu hogar...</p></div></div>
  if (householdError && !household) return <div className="auth-screen"><div className="auth-card"><div className="auth-brand"><div className="brand-mark"><Wallet size={21} /></div><strong>EnQuéGasto</strong></div><h1>No pudimos consultar tu hogar</h1><p>{householdError}</p><button className="primary-button auth-submit" onClick={() => window.location.reload()}>Volver a intentar</button><button className="auth-toggle" onClick={signOut}>Cerrar sesión</button></div></div>
  if (!household) return <HouseholdSetup onCreate={createHousehold} onSignOut={signOut} error={householdError} />
  return <FinanceApp household={household} userId={session.user.id} onSignOut={signOut} />
}

function HouseholdSetup({ onCreate, onSignOut, error }: { onCreate: (name: string) => Promise<void>; onSignOut: () => void; error: string }) {
  const [name, setName] = useState('Hogar de Agus y Camila')
  const [busy, setBusy] = useState(false)
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    await onCreate(name.trim())
    setBusy(false)
  }
  return <div className="auth-screen"><form className="auth-card" onSubmit={submit}>
    <div className="auth-brand"><div className="brand-mark"><Wallet size={21} /></div><div><strong>EnQuéGasto</strong><span>Finanzas compartidas</span></div></div>
    <div className="eyebrow">PRIMER PASO</div><h1>Creá tu hogar</h1>
    <p>Este será el espacio privado donde vos y Camila podrán compartir sus movimientos y categorías.</p>
    <label className="field-label">Nombre del hogar<input value={name} onChange={e => setName(e.target.value)} maxLength={60} required /></label>
    {error && <div className="auth-error">{error}</div>}
    <button className="primary-button auth-submit" type="submit" disabled={busy}>{busy ? 'Creando hogar...' : 'Crear hogar'}</button>
    <button className="auth-toggle" type="button" onClick={onSignOut}>Cerrar sesión</button>
  </form></div>
}

function HouseholdReady({ household, onSignOut }: { household: Household; onSignOut: () => void }) {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('Hogar configurado correctamente.')

  async function invite(event: FormEvent) {
    event.preventDefault()
    if (!supabase || !email.trim()) return
    setBusy(true); setError(''); setMessage('')
    const { data, error: inviteError } = await supabase.rpc('add_household_member', { member_email: email.trim() })
    setBusy(false)
    if (inviteError) { setError(inviteError.message); return }
    setMessage(typeof data === 'string' ? data : 'Integrante agregado correctamente.')
    setEmail('')
  }

  return <div className="auth-screen"><div className="auth-card">
    <div className="auth-brand"><div className="brand-mark"><Wallet size={21} /></div><div><strong>EnQuéGasto</strong><span>Finanzas compartidas</span></div></div>
    <div className="eyebrow">HOGAR CREADO</div><h1>{household.name}</h1>
    <p>Tu espacio compartido ya está creado. Cuando Camila se registre, ingresá el mismo correo que usó para crear su cuenta.</p>
    <form onSubmit={invite}>
      <label className="field-label">Correo de Camila<input type="email" autoComplete="email" placeholder="camila@email.com" value={email} onChange={e => setEmail(e.target.value)} required /></label>
      {error && <div className="auth-error">{error}</div>}
      {message && <div className="auth-message">{message}</div>}
      <button className="primary-button auth-submit" type="submit" disabled={busy}>{busy ? 'Vinculando cuenta...' : 'Vincular a mi hogar'}</button>
    </form>
    <button className="auth-toggle" type="button" onClick={onSignOut}>Cerrar sesión</button>
  </div></div>
}

export default App
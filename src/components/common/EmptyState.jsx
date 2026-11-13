export default function EmptyState({ icon: Icon, title, description, action, compact = false }) {
  return (
    <div
      className={`card relative flex flex-col items-center overflow-hidden text-center ${compact ? 'px-6 py-10' : 'px-6 py-16 md:py-20'}`}
    >
      <Decor />
      <div className="relative flex size-16 items-center justify-center rounded-full bg-gold-soft text-gold">
        {Icon && <Icon className="size-7" strokeWidth={1.6} aria-hidden />}
      </div>
      <h2 className="relative mt-5 font-serif text-xl font-bold text-ink">{title}</h2>
      {description && <p className="relative mt-2 max-w-sm text-sm leading-relaxed text-muted">{description}</p>}
      {action && <div className="relative mt-6">{action}</div>}
    </div>
  )
}

function Decor() {
  // 은은한 눈송이 장식 (장식용이므로 스크린리더에서 숨김)
  const flakes = [
    { l: '12%', d: '0s', s: 6 },
    { l: '28%', d: '2.4s', s: 4 },
    { l: '71%', d: '1.2s', s: 5 },
    { l: '86%', d: '3.6s', s: 4 },
  ]
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      {flakes.map((f, i) => (
        <span
          key={i}
          className="absolute top-0 animate-snow rounded-full bg-gold/30"
          style={{ left: f.l, width: f.s, height: f.s, animationDelay: f.d }}
        />
      ))}
    </div>
  )
}

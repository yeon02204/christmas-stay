import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Flame, GitCompareArrows, Highlighter, Plus, UtensilsCrossed } from 'lucide-react'
import EmptyState from '../components/common/EmptyState.jsx'
import { useToast } from '../components/common/Toast.jsx'
import CompareTable, { RoomSelect } from '../components/compare/CompareTable.jsx'
import TripDatePicker from '../components/layout/TripDatePicker.jsx'
import { useDerived, useStore } from '../store/AppStore.jsx'

function Toggle({ on, onClick, icon: Icon, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`btn btn-sm ${on ? 'bg-burgundy text-white' : 'border border-line bg-white text-ink/75 hover:border-gold'}`}
    >
      <Icon className="size-4" aria-hidden /> {children}
    </button>
  )
}

export default function ComparePage() {
  const { state, actions } = useStore()
  const { roomsById, roomsByStay, staysById } = useDerived()
  const toast = useToast()
  const [highlight, setHighlight] = useState(true)
  const rooms = state.compare.map((id) => roomsById[id]).filter(Boolean)
  const opts = state.compareOptions

  const setOpt = (patch) => actions.setCompareOptions(patch).catch((err) => toast.error(err))

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-serif text-2xl font-bold md:text-3xl">객실 비교</h1>
        <p className="mt-1 text-sm text-muted">최대 3개 객실을 같은 날짜·같은 조건으로 비교해. 비교 목록은 나만 보여.</p>
      </div>

      {rooms.length === 0 ? (
        <EmptyState
          icon={GitCompareArrows}
          title="비교할 객실을 담아 줘"
          description="숙소 카드나 객실 카드의 비교 버튼을 누르면 여기에 모여. 최대 3개까지 담을 수 있어."
          action={
            state.rooms.length > 0 ? (
              <div className="w-64">
                <RoomSelect
                  rooms={state.rooms}
                  roomsByStay={roomsByStay}
                  staysById={staysById}
                  placeholder="객실 바로 추가"
                  onPick={(id) => actions.setCompareList([id]).catch((err) => toast.error(err))}
                />
              </div>
            ) : (
              <Link to="/stays/new" className="btn-primary">
                <Plus className="size-4" aria-hidden /> 숙소 등록
              </Link>
            )
          }
        />
      ) : (
        <>
          <div className="card flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <TripDatePicker />
              <span className="hidden h-6 w-px bg-line md:block" aria-hidden />
              <Toggle on={opts.bbq} onClick={() => setOpt({ bbq: !opts.bbq })} icon={UtensilsCrossed}>
                바비큐 포함
              </Toggle>
              <Toggle on={opts.fire} onClick={() => setOpt({ fire: !opts.fire })} icon={Flame}>
                불멍 포함
              </Toggle>
            </div>
            <div className="self-start md:self-auto">
            <Toggle on={highlight} onClick={() => setHighlight((v) => !v)} icon={Highlighter}>
              차이 강조
            </Toggle>
            </div>
          </div>
          <p className="-mt-1 text-xs leading-relaxed text-muted">
            예상 총비용 = 기본 숙박비 + 필수 추가금 + 선택한 추가금. 금액이 없는 항목은 0원으로 치지 않고 ‘가격 미확인’으로 남겨. ‘가장 저렴’ 표시는 계산이
            끝난 객실이 2개 이상일 때만 나타나.
          </p>
          <CompareTable rooms={rooms} highlight={highlight} />
          <p className="text-center text-xs text-muted md:hidden">← 표를 옆으로 밀어서 비교해 →</p>
        </>
      )}
    </div>
  )
}

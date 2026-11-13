import { Link } from 'react-router-dom'
import { ChevronRight, Pencil, Users } from 'lucide-react'
import ImageGallery from './ImageGallery.jsx'
import { CompareButton, FavoriteButton } from './RoomActions.jsx'
import { AvailabilityChip, FacilityChips, RatingBadge, RoomPrice, guestText } from './roomDisplay.jsx'
import { useDerived } from '../../store/AppStore.jsx'

export default function RoomCard({ room }) {
  const { key, myRatings, partnerRatings, partner } = useDerived()
  const guests = guestText(room)
  return (
    <article className="card flex animate-fade-up flex-col overflow-hidden">
      <div className="relative">
        <ImageGallery images={room.images} alt={room.name} rounded="rounded-none" />
        <div className="absolute bottom-3 right-3 flex gap-2">
          <FavoriteButton room={room} />
          <CompareButton room={room} />
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-serif text-lg font-bold leading-snug">{room.name}</h3>
            <p className="mt-0.5 flex items-center gap-1 text-[13px] text-muted">
              <Users className="size-3.5" aria-hidden />
              {guests || '인원 정보 확인 필요'}
              {room.bedType && ` · ${room.bedType}`}
            </p>
          </div>
          <Link to={`/stays/${room.stayId}/rooms/${room.id}/edit`} className="icon-btn -mr-2 -mt-1 text-muted" aria-label={`${room.name} 수정`}>
            <Pencil className="size-4" />
          </Link>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <RoomPrice room={room} rangeKey={key} className="text-lg" />
          <AvailabilityChip room={room} rangeKey={key} />
        </div>
        <FacilityChips facilities={room.facilities} max={5} />
        <div className="flex flex-wrap gap-1.5">
          <RatingBadge ratings={myRatings[room.id]} label="내 평가" />
          {partner && <RatingBadge ratings={partnerRatings[room.id]} label={partner.displayName} />}
        </div>
        <div className="mt-auto pt-1">
          <Link to={`/stays/${room.stayId}/rooms/${room.id}`} className="btn-outline w-full">
            객실 상세 보기 <ChevronRight className="size-4" aria-hidden />
          </Link>
        </div>
      </div>
    </article>
  )
}

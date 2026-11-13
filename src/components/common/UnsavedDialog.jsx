import ConfirmDialog from './ConfirmDialog.jsx'

export default function UnsavedDialog({ blocker }) {
  return (
    <ConfirmDialog
      open={blocker.state === 'blocked'}
      title="저장하지 않은 내용이 있어"
      description="이 페이지를 나가면 입력한 내용이 사라져. 정말 나갈까?"
      confirmLabel="나가기"
      cancelLabel="계속 입력하기"
      tone="danger"
      onCancel={() => blocker.reset?.()}
      onConfirm={() => blocker.proceed?.()}
    />
  )
}

export default function OfflinePage() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h1 className="text-xl font-semibold">오프라인입니다</h1>
      <p className="mt-2 text-sm text-ink-3">Recall Studio의 학습 데이터는 로컬 API(포트 4000)에서 옵니다. API와 네트워크 연결을 확인한 뒤 다시 시도하세요.</p>
    </div>
  );
}

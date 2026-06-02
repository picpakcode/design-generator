import ShareView from '@/components/ShareView'

export default function SharePage({ params }: { params: { token: string } }) {
  return <ShareView token={params.token} />
}

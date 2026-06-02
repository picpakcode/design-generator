import DesignWorkspace from '@/components/DesignWorkspace'

export default function ProjectPage({
  params,
  searchParams,
}: {
  params: { id: string }
  searchParams: { share?: string }
}) {
  return <DesignWorkspace projectId={params.id} defaultOpenShare={searchParams.share === '1'} />
}

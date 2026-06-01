import DesignWorkspace from '@/components/DesignWorkspace'

export default function ProjectPage({ params }: { params: { id: string } }) {
  return <DesignWorkspace projectId={params.id} />
}

import { checkMcpAuth, unauthorized } from '../../_auth'
import { getFolders } from '@/lib/canto'

export async function GET(req: Request) {
  if (!checkMcpAuth(req)) return unauthorized()

  try {
    const folders = await getFolders()
    return Response.json(folders)
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 })
  }
}

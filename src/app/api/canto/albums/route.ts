import { NextResponse } from 'next/server'
import { getFolders } from '@/lib/canto'

export async function GET() {
  try {
    const folders = await getFolders()
    return NextResponse.json(folders)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

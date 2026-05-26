import { NextResponse } from 'next/server'
import { searchAssets } from '@/lib/canto'

export async function GET() {
  try {
    await searchAssets('icon', 1)
    return NextResponse.json({ connected: true })
  } catch (err) {
    return NextResponse.json({ connected: false, error: String(err) }, { status: 500 })
  }
}

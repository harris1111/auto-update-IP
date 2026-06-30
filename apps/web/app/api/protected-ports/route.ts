import { NextResponse } from 'next/server';
import { getAllowedPorts } from '@/lib/validators';

export async function GET() {
  return NextResponse.json({ ports: getAllowedPorts() });
}

import { redirect } from 'next/navigation'
import { checkTravelAuth } from '@/lib/travel-auth'
import { TravelSidebar } from './_sidebar'

export default async function TravelLayout({ children }: { children: React.ReactNode }) {
  const sess = await checkTravelAuth()
  if (!sess) redirect('/travel-login')

  return (
    <div className="min-h-screen flex bg-gray-50">
      <TravelSidebar agencyName={sess.agency_name} displayName={sess.display_name} role={sess.role} />
      <main className="flex-1 ml-60">
        <div className="p-8">{children}</div>
      </main>
    </div>
  )
}

import React from 'react'

const DashboardPage = () => {
    return (
        <div className="p-8">
            <header className="mb-8">
                <h1 className="text-3xl font-bold">Dashboard</h1>
                <p className="text-muted-foreground">Welcome back,</p>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="p-6 rounded-xl bg-card border border-border shadow-sm">
                    <h3 className="font-semibold mb-2">My Courses</h3>
                    <p className="text-sm text-muted-foreground">Placeholder content</p>
                </div>
                {/* More placeholders */}
            </div>
        </div>
    )
}

export default DashboardPage

import React from 'react'

const AuthPage = () => {
    return (
        <div className="flex flex-col items-center justify-center min-h-screen p-4">
            <h1 className="text-3xl font-bold bg-gradient-to-tr from-primary to-accent bg-clip-text text-transparent">
                Authentication
            </h1>
            <p className="text-muted-foreground mt-2">Sign in or create an account (Placeholder)</p>
            {/* Forms will go here */}
        </div>
    )
}

export default AuthPage

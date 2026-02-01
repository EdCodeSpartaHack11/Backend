export const api = {
    baseUrl: '/api',

    async request(endpoint, options = {}) {
        const url = `${this.baseUrl}${endpoint}`
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers,
        }

        const token = localStorage.getItem('token')
        if (token) {
            headers['Authorization'] = `Bearer ${token}`
        }

        const response = await fetch(url, {
            ...options,
            headers,
        })

        const data = await response.json()

        if (!response.ok) {
            throw new Error(data.detail || 'Something went wrong')
        }

        return data
    },

    post(endpoint, body) {
        return this.request(endpoint, {
            method: 'POST',
            body: JSON.stringify(body),
        })
    },

    get(endpoint) {
        return this.request(endpoint, { method: 'GET' })
    }
}

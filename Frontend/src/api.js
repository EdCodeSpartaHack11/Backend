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

        try {
            const response = await fetch(url, {
                ...options,
                headers,
            })

            const text = await response.text()
            let data
            try {
                data = JSON.parse(text)
            } catch (e) {
                // If response is not JSON
                if (!response.ok) {
                    throw new Error(`Server Error ${response.status}: ${text.slice(0, 100)}`)
                }
                data = text // Return text calls that expect it? Though this is api wrapper
            }

            if (!response.ok) {
                throw new Error(data.detail || data.message || `Error ${response.status}`)
            }

            return data
        } catch (error) {
            console.error('API Request Failed:', error)
            throw error
        }
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

/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        './app/**/*.{js,jsx,ts,tsx}',
        './src/**/*.{js,jsx,ts,tsx}',
    ],
    presets: [require('nativewind/preset')],
    theme: {
        extend: {
            colors: {
                brand: '#FF6633',
                'brand-light': '#FF8855',
                'brand-dark': '#E55520',
                surface: '#1C1C1E',
                card: '#2C2C2E',
                border: '#3A3A3C',
                subtitle: '#98989D',
                'ios-blue': '#0A84FF',
                success: '#30D158',
                warning: '#FFD60A',
                danger: '#FF453A',
                amber: '#FF9F0A',
            },
        },
    },
    plugins: [],
};

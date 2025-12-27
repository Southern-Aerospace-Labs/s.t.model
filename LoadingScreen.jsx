import React, { useEffect, useState } from 'react';

const LoadingScreen = ({ isExiting, onComplete }) => {
    const [count, setCount] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => {
            setCount(prev => {
                if (prev >= 100) {
                    clearInterval(interval);
                    return 100;
                }
                return prev + 1; // Smoother increment
            });
        }, 20); // Adjust speed as needed (20ms * 100 = 2s approx)

        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (count === 100 && onComplete) {
            setTimeout(() => {
                onComplete();
            }, 300);
        }
    }, [count, onComplete]);

    return (
        <div
            className={`fixed inset-0 z-[2000] bg-black flex items-center justify-center text-white font-sans transition-transform duration-700 ease-in-out delay-500 will-change-transform ${isExiting ? '-translate-y-full' : 'translate-y-0'}`}
        >
            <div className={`text-center transition-opacity duration-500 ease-out ${isExiting ? 'opacity-0' : 'opacity-100'}`}>
                <div className="reveal-mask">
                    <div className="reveal-item immediate stagger-1 text-9xl font-bold tracking-tighter tabular-nums selection:bg-brand-red selection:text-white">
                        {Math.floor(count)}
                        <span className="text-4xl align-top text-brand-red">%</span>
                    </div>
                </div>
                <div className="reveal-mask mt-4">
                    <div className="reveal-item immediate stagger-2">
                        <div className="text-brand-gray-300 uppercase tracking-[0.5em] text-sm animate-pulse">
                            Initializing Satellite Link
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LoadingScreen;

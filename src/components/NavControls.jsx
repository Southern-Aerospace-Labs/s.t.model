import React from 'react';
import { MousePointer2, Move, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

const NavControls = ({ activeMode, setMode, onZoomIn, onZoomOut, onResetZoom }) => {
    const modes = [
        { id: 'SELECT', label: 'SELECT', icon: <MousePointer2 size={16} strokeWidth={2.5} /> },
        { id: 'PAN', label: 'PAN', icon: <Move size={16} strokeWidth={2.5} /> }
    ];

    const actions = [
        { id: 'ZOOM_IN', label: 'IN', icon: <ZoomIn size={16} strokeWidth={2.5} />, onClick: onZoomIn },
        { id: 'ZOOM_OUT', label: 'OUT', icon: <ZoomOut size={16} strokeWidth={2.5} />, onClick: onZoomOut },
        { id: 'RESET', label: 'RESET', icon: <RotateCcw size={16} strokeWidth={2.5} />, onClick: onResetZoom }
    ];

    const containerStyle = {
        display: 'flex',
        gap: '2px',
        background: 'rgba(10, 10, 10, 0.85)',
        backdropFilter: 'blur(12px)',
        padding: '4px',
        borderRadius: '8px',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
        pointerEvents: 'auto'
    };

    const buttonBase = {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        width: '42px',
        height: '42px',
        border: 'none',
        borderRadius: '6px',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        gap: '2px'
    };

    const modeBtnStyle = (active) => ({
        ...buttonBase,
        background: active ? '#ED1C2E' : 'transparent',
        color: active ? '#111' : '#888',
    });

    const actionBtnStyle = {
        ...buttonBase,
        background: 'transparent',
        color: '#aaa',
    };

    const labelStyle = {
        fontSize: '7px',
        fontWeight: '800',
        letterSpacing: '0.08em',
        textTransform: 'uppercase'
    };

    return (
        <div style={{
            position: 'absolute',
            top: '20px',
            right: '25px',
            display: 'flex',
            flexDirection: 'row', // SIDE BY SIDE
            gap: '12px',
            zIndex: 1000,
            fontFamily: 'Unbounded, sans-serif'
        }}>
            {/* Mode Toggles */}
            <div style={containerStyle}>
                {modes.map((m) => (
                    <button
                        key={m.id}
                        onClick={() => setMode(m.id)}
                        style={modeBtnStyle(activeMode === m.id)}
                        title={m.label}
                    >
                        {m.icon}
                        <span style={labelStyle}>{m.label}</span>
                    </button>
                ))}
            </div>

            {/* Zoom Actions */}
            <div style={containerStyle}>
                {actions.map((a) => (
                    <button
                        key={a.id}
                        onClick={a.onClick}
                        style={actionBtnStyle}
                        title={a.label}
                        onMouseEnter={(e) => {
                            const btn = e.currentTarget;
                            btn.style.color = '#fff';
                            btn.style.background = 'rgba(255,255,255,0.05)';
                        }}
                        onMouseLeave={(e) => {
                            const btn = e.currentTarget;
                            btn.style.color = '#aaa';
                            btn.style.background = 'transparent';
                        }}
                    >
                        {a.icon}
                        <span style={labelStyle}>{a.label}</span>
                    </button>
                ))}
            </div>
        </div>
    );
};

export default NavControls;

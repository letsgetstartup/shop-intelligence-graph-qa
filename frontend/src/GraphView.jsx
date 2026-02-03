import React, { useEffect, useState, useRef } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { Activity, ZoomIn, ZoomOut, RefreshCw } from 'lucide-react';

const GraphView = () => {
    const [graphData, setGraphData] = useState({ nodes: [], links: [] });
    const [loading, setLoading] = useState(true);
    const [dimensions, setDimensions] = useState({ w: 800, h: 600 });
    const containerRef = useRef(null);
    const fgRef = useRef();

    const fetchGraph = async () => {
        setLoading(true);
        try {
            const res = await fetch('http://localhost:8080/graph/raw', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ limit: 300 }) // Limit to avoids browser lag
            });
            const data = await res.json();
            setGraphData(data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchGraph();

        const updateDims = () => {
            if (containerRef.current) {
                setDimensions({
                    w: containerRef.current.offsetWidth,
                    h: containerRef.current.offsetHeight
                });
            }
        };

        window.addEventListener('resize', updateDims);
        updateDims();
        setTimeout(updateDims, 500); // Hack for initial layout

        return () => window.removeEventListener('resize', updateDims);
    }, []);

    return (
        <div className="flex-1 flex flex-col h-full relative bg-slate-900 overflow-hidden">
            <div className="absolute top-4 left-4 z-10 flex gap-2">
                <button
                    onClick={fetchGraph}
                    className="p-2 bg-slate-800 text-white rounded-lg hover:bg-slate-700 shadow-lg border border-slate-700"
                    title="Refresh Graph"
                >
                    <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
                </button>
            </div>

            <div className="absolute top-4 right-4 z-10 bg-slate-800/80 backdrop-blur p-4 rounded-xl border border-slate-700 text-slate-300 text-xs">
                <div className="font-bold mb-2 uppercase tracking-widest flex items-center gap-2">
                    <Activity size={14} className="text-teal-400" />
                    Graph Statistics
                </div>
                <div>Nodes: {graphData.nodes.length}</div>
                <div>Edges: {graphData.links.length}</div>
            </div>

            <div className="flex-1 w-full h-full" ref={containerRef}>
                <ForceGraph2D
                    ref={fgRef}
                    width={dimensions.w}
                    height={dimensions.h}
                    graphData={graphData}
                    nodeLabel="label"
                    nodeAutoColorBy="group"
                    nodeRelSize={6}
                    linkColor={() => 'rgba(255,255,255,0.2)'}
                    backgroundColor="#0f172a"
                    d3VelocityDecay={0.1}
                    cooldownTicks={100}
                    onEngineStop={() => fgRef.current.zoomToFit(400)}
                />
            </div>
        </div>
    );
};

export default GraphView;

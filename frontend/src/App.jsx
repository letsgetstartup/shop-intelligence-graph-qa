import React, { useState, useEffect, useRef } from 'react';
import GraphView from './GraphView';
import {
    Activity,
    AlertTriangle,
    Cpu,
    MessageSquare,
    Send,
    ChevronRight,
    ChevronDown,
    Database,
    Terminal,
    Clock,
    Settings,
    BarChart3,
    Search,
    CheckCircle2,
    X,
    Zap,
    LayoutDashboard,
    Bell,
    Calendar,
    Users,
    Box,
    FileText,
    Lightbulb,
    MoreHorizontal,
    TrendingUp,
    AlertCircle,
    ShieldAlert,
    ZapOff,
    ClipboardCheck,
    Wrench
} from 'lucide-react';

const MODULE_DATA = {
    Dashboard: {
        investigate: [
            { label: "58 Blocked Operations", query: "Which operations are blocked due to missing tools?", desc: "Multiple jobs waiting for tools - J26-00001, J26-00002, J26-00005 affected." },
            { label: "Critical Tools Out of Stock", query: "Which tools are missing for job J26-00001?", desc: "Several critical 'A' level tools completely unavailable." },
            { label: "Top Customer Delay Risk", query: "What tools does job J26-00010 need?", desc: "Verify if J26-00010 has all required tools available." }
        ],
        recommendations: [
            { label: "Urgent Tool Procurement", query: "Show me all tools that are needed but out of stock", desc: "Fastest path to unblock 58 waiting operations." },
            { label: "Tool Inventory Audit", query: "Show machines and their loaded magazine status", desc: "Verify tool availability across all machines." },
            { label: "Job Priority Resequencing", query: "Which jobs can run with available tools?", desc: "Maximize throughput while waiting for missing tools." }
        ],
        followUps: [
            "How many jobs are currently in progress?",
            "Which machines are most utilized?",
            "Show me customers with overdue jobs"
        ],
        sidebarAlerts: [
            { id: 'd1', level: 'critical', title: 'Missing Critical Tools', desc: 'J26-00001: 2 critical tools out of stock.', query: "What tools are missing for job J26-00001?" },
            { id: 'd2', level: 'warning', title: '58 Blocked Operations', desc: '58 ops waiting for tools across 5+ jobs.', query: "Which operations are blocked due to missing tools?" }
        ]
    },
    Planning: {
        investigate: [
            { label: "DOOSAN Capacity Overload", query: "Show all scheduled operations for DOOSAN machines next week to identify bottlenecks.", desc: "Check if we need to outsource 20 hours of 5-axis milling work." },
            { label: "Lead Time Variance", query: "Compare planned vs actual lead times for 'Urgent' priority jobs.", desc: "Adjust lead time assumptions for more accurate quoting (currently 15% off)." },
            { label: "Material Shortage Impact", query: "Analyze which upcoming jobs will be delayed by the raw material shortage.", desc: "Identify 12 jobs missing Aluminum 7075-T6 stock before Monday." }
        ],
        recommendations: [
            { label: "Dynamic Re-scheduling", query: "Suggest a re-optimized schedule to prioritize high-margin jobs currently in the queue.", desc: "Optimize for Profit. Shift J26-00040 to top priority." },
            { label: "Work Center Balancing", query: "Recommend work center transfers to balance loads between Milling and Lathe departments.", desc: "Reduce queue time at 'Turn-01' by moving compatible ops to 'Turn-04'." },
            { label: "Predictive Order Timing", query: "Predict the optimal date to start Job J26-00025 to ensure on-time delivery.", desc: "Account for 48h queue time and 2h setup variance." }
        ],
        sidebarAlerts: [
            { id: 'p1', level: 'critical', title: 'Capacity Conflict', desc: 'Overload detected on 21 DOOSAN PUMA700.', query: "Show capacity conflict details for 21 DOOSAN." }
        ]
    },
    Jobs: {
        investigate: [
            { label: "Stalled Job Analysis", query: "Which jobs have not seen any operation activity in the last 24 hours?", desc: "Find jobs sitting in 'Ready' status without an assigned operator." },
            { label: "WIP Cost Leakage", query: "Identify jobs with the highest labor cost relative to their production progress.", desc: "Highlight jobs exceeding quoted labor hours by more than 25%." },
            { label: "Quality Hold Root Cause", query: "Why are 5 jobs currently on 'Quality Hold' in the Finishing department?", desc: "Review non-conformance reports for SHAFT-5422 batch." }
        ],
        recommendations: [
            { label: "Expedite High-Value Jobs", query: "List all jobs over $10k in value that are currently 'In Progress'.", desc: "Prioritize revenue recognition for current monthly billing cycle." },
            { label: "Batching Efficiency", query: "Suggest job batching opportunities for similar parts to reduce setup times.", desc: "Group 5 'Shaft' jobs to save 4 hours of machine setup." },
            { label: "Resource Alignment", query: "Match available skilled operators to high-complexity open jobs.", desc: "Assign Lead Operator to J26-00010 for critical setup." }
        ],
        sidebarAlerts: [
            { id: 'j1', level: 'critical', title: 'J26-00015 Stalled', desc: 'No activity for 18h in Milling.', query: "Investigate status and bottleneck for Job J26-00015." }
        ]
    },
    Machines: {
        investigate: [
            { label: "WC-PREP Idle Time", query: "What is the primary cause of idle time on the WC-PREP machine today?", desc: "Analyze if idle time is due to 'No Operator' or 'No Material'." },
            { label: "Maintenance ROI Check", query: "Compare downtime costs vs preventive maintenance costs for Mill-05.", desc: "Calculate $ loss per minute of spindle downtime vs $300 service cost." },
            { label: "Spindle Deviation Alert", query: "Analyze spindle vibration logs for potential bearing failure on CNC-02.", desc: "Predict remaining life (RUL) before machine seizure risk." }
        ],
        recommendations: [
            { label: "Top-3 Maintenance Priority", query: "Which 3 machines are most likely to fail in the next 14 days based on usage patterns?", desc: "Prioritize preventative maintenance for HAAS-03 and DOOSAN-01." },
            { label: "OEE Benchmarking", query: "Rank all machines by OEE and identify the bottom 10% for focused improvement.", desc: "Target 'Mill-08' for setup time reduction training." },
            { label: "Energy Optimization", query: "Recommend a machine power-down schedule to reduce peak energy costs.", desc: "Save $2k/mo by shifting heavy milling to off-peak utility hours." }
        ],
        sidebarAlerts: [
            { id: 'm1', level: 'warning', title: 'Low OEE Alert', desc: 'DOOSAN PUMA700 running at 45% OEE.', query: "Analyze performance losses for DOOSAN PUMA700." }
        ]
    },
    Operators: {
        investigate: [
            { label: "Efficiency Variance", query: "Analyze why Shift B efficiency is 15% lower than Shift A this week.", desc: "Look for correlation between Shift B and Machine 'Setup' delays." },
            { label: "Skill Gap Analysis", query: "Identify which operators require updated training for the new DOOSAN controls.", desc: "Prepare certification plan for 5 night-shift operators." },
            { label: "Labor Allocation Audit", query: "Are our most experienced operators assigned to the most critical jobs?", desc: "Check if 'Lead' skill level is utilized for +/-0.005 tolerance jobs." }
        ],
        recommendations: [
            { label: "Optimal Crewing List", query: "Suggest the best operator assignments for the upcoming night shift.", desc: "Maximize output by pairing top-performers with available setups." },
            { label: "Productivity Leaders", query: "Rank operators by 'Parts per Hour' for the last 30 days.", desc: "Identify potential trainers for efficiency coaching sessions." },
            { label: "Training ROI Impact", query: "Predict the throughput increase from cross-training 3 more operators on Milling.", desc: "Crossing-training 'Lathe' staff could reduce Milling backlog by 20%." }
        ],
        sidebarAlerts: [
            { id: 'o1', level: 'info', title: 'Shift Handoff', desc: 'Shift A to B transition: 12 jobs transferred.', query: "Show shift transition status report." }
        ]
    },
    Analytics: {
        investigate: [
            { label: "Monthly Margin Drain", query: "Show the top 5 factors reducing our gross margin this month.", desc: "Analyze impact of increased tooling consumption on part SHAFT-88." },
            { label: "Customer Profitability", query: "Compare total revenue vs total production cost for our top 5 customers.", desc: "Is Siemens 15% more profitable than Galil Aero due to batch size?" },
            { label: "Rework Cost Trends", query: "Is our rework cost increasing? Show trends by department.", desc: "Identify why Op 40 rework has doubled in the last 14 days." }
        ],
        recommendations: [
            { label: "30-Day Cash Flow Forecast", query: "Forecast revenue based on projected job completion dates for the next 30 days.", desc: "Project $450k revenue based on currently open 'Closed' shipments." },
            { label: "Operational ROI Goals", query: "Set 3 target areas for 5% cost reduction based on current data.", desc: "Target: Tooling, Scrap, and Overtime reduction." },
            { label: "Waste Reduction Plan", query: "Suggest steps to reduce material waste by 10% based on scrap logs.", desc: "Optimize bar-feeder settings for Aluminum stock efficiency." }
        ],
        sidebarAlerts: [
            { id: 'a1', level: 'warning', title: 'Budget Variance', desc: 'Consumables cost is 20% over budget.', query: "Analyze tooling cost increase." }
        ]
    },
    Inventory: {
        investigate: [
            { label: "Dead Stock Valuation", query: "Identify raw materials that haven't been used in over 180 days.", desc: "Liquidate $12k of obsolete Titanium stock to improve cash flow." },
            { label: "Safety Stock Breach", query: "List all items currently below their defined safety stock levels.", desc: "Urgent check for Tool Bits #40 - 0 currently in stock." },
            { label: "Vendor Quality Audit", query: "Which material vendors have the highest rejection rates?", desc: "Evaluate 'Reliable Steel' vs 'Shop Pro' for next quarter's contract." }
        ],
        recommendations: [
            { label: "JIT Order Schedule", query: "Generate a 'Just-In-Time' order list for materials needed next week.", desc: "Order $8k raw stock 48h before scheduled start of J26-00050." },
            { label: "Inventory Turnover Opt", query: "Suggest 3 ways to improve inventory turnover for Aluminum stock.", desc: "Reduce carrying cost by improving batch planning from 2 weeks to 1 week." },
            { label: "Storage Space Audit", query: "How can we optimize rack space based on current material dimensions?", desc: "Re-organize Racks 4-6 to fit 15% more long-bar stock." }
        ],
        sidebarAlerts: [
            { id: 'i1', level: 'critical', title: 'Stock-Out Risk', desc: 'Aluminum 6061-T6 stock is critical (5% left).', query: "Analyze material demand for Aluminum 6061-T6." }
        ]
    },
    Reports: {
        investigate: [],
        recommendations: [
            { label: "Executive OEE Summary", query: "Generate a one-page OEE and Efficiency report for management.", desc: "Weekly rollup of all 12 machines for Monday's board meeting." },
            { label: "Down-Time Pareto", query: "Show a Pareto analysis of top 5 downtime causes this month.", desc: "80% of downtime is caused by 20% of machines. Find them." },
            { label: "Customer On-Time Report", query: "Generate an on-time delivery (OTD) report by customer.", desc: "Analyze OTD trends to improve customer service scores." }
        ],
        sidebarAlerts: []
    },
    Graph: {
        investigate: [],
        recommendations: [],
        sidebarAlerts: []
    }
};

const InfographicRenderer = ({ data }) => {
    if (!data) return null;
    const { type, value, label, unit, status } = data;

    const statusColors = {
        green: { bg: 'bg-emerald-500', text: 'text-emerald-600', ring: 'ring-emerald-100', border: 'border-emerald-200' },
        amber: { bg: 'bg-amber-500', text: 'text-amber-600', ring: 'ring-amber-100', border: 'border-amber-200' },
        red: { bg: 'bg-red-500', text: 'text-red-600', ring: 'ring-red-100', border: 'border-red-200' }
    };

    const config = statusColors[status] || statusColors.amber;

    if (type === 'gauge' || type === 'bar') {
        return (
            <div className={`mt-4 p-5 rounded-2xl border-2 ${config.border} bg-white shadow-xl ring-4 ${config.ring} animate-in zoom-in-95 duration-500 overflow-hidden`}>
                <div className="flex justify-between items-end mb-3">
                    <div>
                        <span className="text-[11px] font-black uppercase text-slate-500 tracking-[0.15em] mb-1 block">{label}</span>
                        <div className={`text-4xl font-black ${config.text} leading-none tracking-tighter`}>
                            {value}<span className="text-xl ml-1 opacity-70">{unit}</span>
                        </div>
                    </div>
                    <div className={`${config.bg} p-2 rounded-xl text-white shadow-lg`}>
                        <Activity size={20} />
                    </div>
                </div>
                <div className="w-full h-5 bg-slate-100 rounded-full overflow-hidden border-2 border-slate-50 relative shadow-inner">
                    <div
                        className={`absolute top-0 left-0 h-full ${config.bg} transition-all duration-1000 ease-out shadow-[0_0_20px_rgba(0,0,0,0.2)]`}
                        style={{ width: `${Math.min(value, 100)}%` }}
                    />
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-[1px] h-full bg-white/30 absolute left-[33%]"></div>
                        <div className="w-[1px] h-full bg-white/30 absolute left-[66%]"></div>
                    </div>
                </div>
                <div className="flex justify-between mt-2 px-1">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Efficiency</span>
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Target Met</span>
                </div>
            </div>
        );
    }

    if (type === 'status' || type === 'kpi') {
        return (
            <div className={`mt-4 p-5 rounded-2xl border ${config.border} bg-white shadow-sm flex items-center gap-4 group hover:shadow-md transition-all ring-1 ${config.ring}`}>
                <div className={`w-14 h-14 rounded-2xl ${config.bg} flex items-center justify-center text-white shadow-lg ${config.bg.replace('bg-', 'shadow-')}/20 group-hover:scale-105 transition-transform`}>
                    <Activity size={28} />
                </div>
                <div>
                    <div className="text-[10px] font-black uppercase text-slate-400 tracking-widest leading-none mb-1">{label}</div>
                    <div className={`text-2xl font-black ${config.text} leading-none tracking-tighter`}>{value}{unit}</div>
                </div>
            </div>
        );
    }

    return null;
};

const ReasoningBlock = ({ thought, cypher }) => {
    const [isOpen, setIsOpen] = useState(true);
    return (
        <div className="mb-6 rounded-xl border border-teal-100 bg-white shadow-sm overflow-hidden ring-1 ring-slate-100 animate-in fade-in duration-300">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between px-4 py-3 bg-teal-50/30 hover:bg-teal-50/60 transition-colors text-xs font-semibold text-teal-700 uppercase tracking-wide border-b border-teal-100"
            >
                <span className="flex items-center gap-2">
                    <Cpu size={14} className="text-teal-600" />
                    Intelligence Engine
                </span>
                {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
            {isOpen && (
                <div className="p-4 text-sm space-y-4 bg-white">
                    <div>
                        <div className="text-slate-400 text-[10px] mb-2 flex items-center gap-1 uppercase tracking-widest font-bold">
                            <Lightbulb size={12} className="text-amber-400" /> Logic Path
                        </div>
                        <p className="text-slate-600 whitespace-pre-line leading-relaxed pl-3 border-l-2 border-teal-200">
                            {thought}
                        </p>
                    </div>
                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 relative group">
                        <div className="text-slate-400 text-[10px] mb-2 flex items-center gap-1 uppercase tracking-widest font-bold">
                            <Database size={12} className="text-indigo-400" /> Cypher Query
                        </div>
                        <code className="text-indigo-600 block break-words text-xs font-mono bg-white p-2 rounded border border-slate-100 shadow-sm">
                            {cypher}
                        </code>
                    </div>
                </div>)}
        </div>);
};

const ChatMessage = ({ msg }) => {
    const isUser = msg.type === 'user';
    return (
        <div className={`flex w-full mb-8 ${isUser ? 'justify-end' : 'justify-start'}`}>
            {!isUser && (
                <div className="w-10 h-10 rounded-full bg-white border border-slate-100 flex items-center justify-center mr-4 mt-0 shrink-0 shadow-sm">
                    <div className="w-6 h-6 bg-teal-100 rounded-full flex items-center justify-center">
                        <Zap size={14} className="text-teal-600" fill="currentColor" /> </div>
                </div>)}
            <div className={`max-w-[85%] ${isUser ? 'items-end' : 'items-start'}`}>
                {isUser && (
                    <div className="bg-teal-600 text-white px-6 py-4 rounded-2xl rounded-tr-sm shadow-md">
                        <p className="text-sm font-medium leading-relaxed">{msg.text}</p> </div>
                )}
                {!isUser && (<div className="flex flex-col">
                    {msg.isThinking ? (
                        <div className="flex items-center gap-3 text-slate-500 text-sm font-medium animate-pulse bg-white px-4 py-3 rounded-xl shadow-sm border border-slate-100 w-fit">
                            <div className="w-2.5 h-2.5 bg-teal-500 rounded-full animate-bounce"></div>
                            <div className="w-2.5 h-2.5 bg-teal-500 rounded-full animate-bounce delay-75"></div>
                            <div className="w-2.5 h-2.5 bg-teal-500 rounded-full animate-bounce delay-150"></div>
                            <span className="ml-1 italic opacity-70">Synthesizing data...</span> </div>
                    ) : (<>
                        {msg.reasoning && (
                            <ReasoningBlock
                                thought={msg.reasoning.thought}
                                cypher={msg.reasoning.cypher}
                            />
                        )}
                        <div className="bg-white border border-slate-100 text-slate-700 px-6 py-5 rounded-2xl rounded-tl-sm shadow-sm relative overflow-hidden group">
                            <div className="markdown-body text-sm leading-7 whitespace-pre-wrap relative z-10">
                                {(() => {
                                    // Strip any leaked metadata tags ([ACTIONS: ...] or [INFOGRAPHIC: ...])
                                    const cleanText = msg.text.replace(/\[ACTIONS:\s*[\s\S]*?\]/g, '').replace(/\[INFOGRAPHIC:\s*[\s\S]*?\]/g, '').trim();

                                    const regex = /\[INFOGRAPHIC:\s*(.*?)\]/g;
                                    const parts = [];
                                    let lastIndex = 0;
                                    let match;

                                    while ((match = regex.exec(cleanText)) !== null) {
                                        parts.push(cleanText.substring(lastIndex, match.index));
                                        try {
                                            const data = JSON.parse(match[1]);
                                            parts.push(<InfographicRenderer key={match.index} data={data} />);
                                        } catch (e) {
                                            parts.push(<span key={match.index} className="text-xs text-red-400 block my-2">Visual Error: {e.message}</span>);
                                        }
                                        lastIndex = regex.lastIndex;
                                    }
                                    parts.push(cleanText.substring(lastIndex));

                                    if (parts.length > 1 || cleanText.includes('[INFOGRAPHIC:')) {
                                        return <>{parts}</>;
                                    }
                                    return cleanText;
                                })()}
                            </div>
                            <div className="absolute top-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <MoreHorizontal size={14} className="text-slate-300" /> </div>
                        </div>
                        {msg.followUps && msg.followUps.length > 0 && (
                            <div className="mt-6 flex flex-wrap gap-3 pl-1">
                                {msg.followUps.map((action, idx) => {
                                    const IconComponent = {
                                        Wrench: () => <Wrench size={12} />,
                                        AlertTriangle: () => <AlertTriangle size={12} />,
                                        ArrowRight: () => <ChevronRight size={12} />,
                                        CheckCircle2: () => <CheckCircle2 size={12} />,
                                        Database: () => <Database size={12} />,
                                        TrendingUp: () => <TrendingUp size={12} />,
                                        ShieldAlert: () => <ShieldAlert size={12} />,
                                        Box: () => <Box size={12} />,
                                        Zap: () => <Zap size={12} />,
                                        Lightbulb: () => <Lightbulb size={12} />
                                    }[action.icon] || (() => <Zap size={12} />);

                                    const label = typeof action === 'string' ? action : action.label;
                                    const query = typeof action === 'string' ? action : action.query;

                                    return (
                                        <button
                                            key={idx}
                                            onClick={() => msg.onFollowUp(query)}
                                            className="flex items-center gap-2.5 text-[11px] font-black bg-white hover:bg-teal-600 text-slate-800 hover:text-white border-2 border-slate-100 hover:border-teal-600 px-5 py-2.5 rounded-xl transition-all shadow-sm hover:shadow-teal-200 active:scale-95 group uppercase tracking-wider"
                                        >
                                            <div className="p-1 rounded bg-slate-50 group-hover:bg-teal-500 group-hover:text-white transition-colors">
                                                <IconComponent />
                                            </div>
                                            {label}
                                        </button>
                                    );
                                })}
                            </div>
                        )} </>
                    )} </div>
                )} </div>
        </div>);
};

export default function ShopIntelligenceApp() {
    const [messages, setMessages] = useState([
        {
            type: 'system',
            text: "Welcome back, Alex. I've analyzed the latest production data from FalkorDB.\n\n**Current Status:**\n• 12 Machines Active\n• 3 Alerts Requires Attention\n\nHow can I help you optimize production today?"
        }]);
    const [inputText, setInputText] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [activeModule, setActiveModule] = useState('Dashboard');
    const [isModuleDropdownOpen, setIsModuleDropdownOpen] = useState(false);
    const chatEndRef = useRef(null);

    const scrollToBottom = () => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleSend = async (text) => {
        if (!text.trim()) return;
        const userMsg = { type: 'user', text };
        setMessages(prev => [...prev, userMsg]);
        setInputText('');
        setIsProcessing(true);
        setMessages(prev => [...prev, { type: 'system', isThinking: true }]);

        try {
            // Use LLM hybrid endpoint (SQL + Cypher)
            const response = await fetch('/queryweaver/hybrid', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question: text }),
            });

            const data = await response.json();
            const evidence = data.evidence || {};

            // Build reasoning block from evidence
            let thought = '';
            if (data.strategy) thought += `Strategy: ${data.strategy.toUpperCase()}`;
            if (data.reasoning) thought += `\n${data.reasoning}`;
            if (evidence.sql_rows > 0) thought += `\nSQL returned ${evidence.sql_rows} rows`;
            if (evidence.graph_data) thought += `\nGraph traversal completed`;
            if (data.timing) thought += `\nLatency: ${(data.timing / 1000).toFixed(1)}s`;

            let cypherDisplay = '';
            if (evidence.sql_query) cypherDisplay += `/* SQL */\n${evidence.sql_query}`;
            if (evidence.sql_query && evidence.cypher_query) cypherDisplay += '\n\n';
            if (evidence.cypher_query) cypherDisplay += `/* Cypher */\n${evidence.cypher_query}`;

            setMessages(prev => {
                const newMsgs = [...prev];
                newMsgs.pop();
                newMsgs.push({
                    type: 'system',
                    text: data.error
                        ? `**Error:** ${data.error}`
                        : (data.answer || "Query completed but returned no answer."),
                    reasoning: cypherDisplay ? {
                        thought: thought || 'Processing query...',
                        cypher: cypherDisplay
                    } : (data.cypherQuery ? {
                        thought: thought || 'Graph query',
                        cypher: data.cypherQuery
                    } : null),
                    followUps: data.suggestions || [],
                    onFollowUp: handleSend
                });
                return newMsgs;
            });
        } catch (error) {
            console.error("Error calling API:", error);
            setMessages(prev => {
                const newMsgs = [...prev];
                newMsgs.pop();
                newMsgs.push({
                    type: 'system',
                    text: "I'm having trouble connecting to the Production Intelligence server. Please ensure the backend is online.",
                    onFollowUp: handleSend
                });
                return newMsgs;
            });
        } finally {
            setIsProcessing(false);
        }
    };

    const handleAlertClick = (alertQuery) => {
        handleSend(alertQuery);
    };

    const modules = Object.keys(MODULE_DATA);

    return (
        <div className="flex h-screen bg-slate-50 text-slate-800 font-sans overflow-hidden selection:bg-teal-100 selection:text-teal-900">
            {/* --- SIDEBAR: NAVIGATION & ALERTS --- */}
            <div className="w-80 bg-white flex flex-col z-20 border-r border-slate-200 shadow-sm">
                {/* Logo Section */}
                <div className="h-20 flex items-center px-6 border-b border-slate-100 shrink-0">
                    <div className="w-10 h-10 bg-teal-600 rounded-lg flex items-center justify-center text-white shadow-lg shadow-teal-600/20 mr-3">
                        <LayoutDashboard size={20} /> </div>
                    <div>
                        <h1 className="font-bold text-slate-800 text-lg tracking-tight leading-tight">Wizechat</h1>
                        <p className="text-[10px] text-teal-600 font-bold uppercase tracking-widest">Production Unit</p>
                    </div>
                </div>
                {/* ACTIVE MODULE DROPDOWN */}
                <div className="px-5 py-6 border-b border-slate-100 shrink-0 relative bg-slate-50/20">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2 px-1">Active Module</label>
                    <button
                        onClick={() => setIsModuleDropdownOpen(!isModuleDropdownOpen)}
                        className="w-full flex items-center justify-between px-4 py-3 text-sm font-bold text-white bg-teal-600 rounded-xl shadow-lg shadow-teal-600/20 hover:bg-teal-700 transition-all group"
                    >
                        <div className="flex items-center gap-3">
                            <Box size={18} className="text-teal-100" />
                            {activeModule}
                        </div>
                        <ChevronDown size={16} className={`transition-transform duration-200 ${isModuleDropdownOpen ? 'rotate-180' : ''}`} /> </button>
                    {isModuleDropdownOpen && (
                        <div className="absolute top-full left-5 right-5 mt-2 bg-white border border-slate-200 rounded-xl shadow-2xl z-30 overflow-hidden animate-in fade-in zoom-in-95 duration-200 ring-1 ring-slate-100">
                            {modules.map((mod) => (
                                <button
                                    key={mod}
                                    onClick={() => {
                                        setActiveModule(mod);
                                        setIsModuleDropdownOpen(false);
                                    }}
                                    className={`w-full text-left px-5 py-3 text-sm font-semibold transition-colors hover:bg-slate-50 flex items-center gap-3 ${activeModule === mod ? 'text-teal-600 bg-teal-50' : 'text-slate-600'}`}
                                >
                                    <Box size={16} className={activeModule === mod ? 'text-teal-600' : 'text-slate-300'} />
                                    {mod}
                                </button>
                            ))}
                        </div>)}
                </div>
                {/* SIDEBAR SYSTEM ALERTS */}
                <div className="flex-1 flex flex-col min-h-0">
                    <div className="px-6 py-5 flex items-center justify-between">
                        <h3 className="text-sm font-bold text-slate-800">System Alerts</h3>
                        <div className="flex items-center gap-1.5 bg-red-50 px-2 py-0.5 rounded-full">
                            <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse"></div>
                            <span className="text-red-600 text-[10px] font-black uppercase">
                                {MODULE_DATA[activeModule].sidebarAlerts.length} Active </span>
                        </div>
                    </div>
                    {/* Small Sidebar Alert Cards */}
                    <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-4 custom-scrollbar">
                        {MODULE_DATA[activeModule].sidebarAlerts.map(alert => (
                            <div
                                key={alert.id}
                                onClick={() => handleAlertClick(alert.query)}
                                className="bg-white border border-slate-200 rounded-xl p-4 cursor-pointer hover:shadow-md hover:border-teal-300 transition-all group relative overflow-hidden"
                            >
                                <div className="flex justify-between items-center mb-2">
                                    <div className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${alert.level === 'critical' ? 'bg-red-100 text-red-600' : alert.level === 'warning' ? 'bg-amber-100 text-amber-600' : 'bg-blue-100 text-blue-600'
                                        }`}>
                                        {alert.level}
                                    </div>
                                    <div className="text-[10px] text-slate-400 font-bold font-mono uppercase">Live</div>
                                </div>
                                <h4 className="text-sm font-bold text-slate-800 mb-1 group-hover:text-teal-600 transition-colors">{alert.title}</h4>
                                <p className="text-xs text-slate-500 line-clamp-1">{alert.desc}</p> </div>
                        ))}
                        {MODULE_DATA[activeModule].sidebarAlerts.length === 0 && (
                            <div className="text-center py-10 opacity-40">
                                <CheckCircle2 size={32} className="mx-auto text-emerald-300 mb-2" />
                                <p className="text-[10px] font-bold uppercase tracking-widest">No Active Alerts</p>
                            </div>
                        )} </div>
                </div>
                {/* Sidebar Footer */}
                <div className="p-5 bg-slate-50 border-t border-slate-100 shrink-0">
                    <div className="bg-white border border-slate-200 rounded-xl p-3 flex items-center gap-3 shadow-sm">
                        <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                        <div>
                            <div className="text-[10px] font-bold text-slate-800 uppercase leading-none">All Systems Green</div>
                            <div className="text-[9px] text-slate-400 mt-1 font-mono uppercase tracking-tighter">92/92 Nodes Connected</div> </div>
                    </div>
                </div>
            </div>
            {/* --- MAIN CONTENT AREA --- */}
            <div className="flex-1 flex flex-col relative bg-white">
                {/* Modern Header */}
                <div className="h-20 border-b border-slate-100 flex items-center justify-between px-10 shrink-0 z-10 bg-white/80 backdrop-blur-md">
                    <div className="flex items-center gap-6">
                        <div>
                            <h2 className="text-xl font-black text-slate-800 tracking-tight">Wizechat</h2>
                            <p className="text-[11px] text-slate-400 font-bold uppercase tracking-[0.2em]">{activeModule} Module Insight</p>
                        </div>
                        <div className="h-10 w-[1px] bg-slate-100"></div>
                        <div className="flex gap-4">
                            <div className="flex flex-col">
                                <span className="text-[10px] text-slate-400 font-bold uppercase">Uptime</span>
                                <span className="text-sm font-bold text-emerald-600">99.8%</span>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-[10px] text-slate-400 font-bold uppercase">Throughput</span>
                                <span className="text-sm font-bold text-slate-700">1.2k/hr</span> </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-6">
                        <div className="hidden md:flex items-center bg-slate-50 border border-slate-100 rounded-2xl px-5 py-2.5 w-72 text-sm transition-all focus-within:ring-2 focus-within:ring-teal-500/20">
                            <Search size={16} className="mr-3 text-slate-300" />
                            <span className="text-slate-400 font-medium">Search graph...</span> </div>
                        <button className="p-2.5 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-xl transition-all relative">
                            <Bell size={20} />
                            <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
                        </button>
                        <div className="flex items-center gap-3 pl-4 border-l border-slate-100">
                            <div className="text-right hidden lg:block">
                                <div className="text-sm font-black text-slate-800">Alex Hales</div>
                                <div className="text-[10px] font-bold text-teal-600 uppercase">Planner</div>
                            </div>
                            <div className="w-11 h-11 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-600 font-black border border-slate-200">AH</div>
                        </div>
                    </div>
                </div>
                {/* Chat Messages Feed */}
                {activeModule === 'Graph' ? <GraphView /> : (
                    <div className="flex-1 overflow-y-auto px-10 py-10 custom-scrollbar bg-slate-50/30">
                        <div className="max-w-4xl mx-auto">
                            {messages.map((msg, idx) => (
                                <ChatMessage key={idx} msg={msg} />
                            ))}
                            <div ref={chatEndRef} />
                        </div>
                    </div>
                )}
                {/* ACTION AREA: Suggestions & Input */}
                <div className={`p-8 bg-white border-t border-slate-100 shadow-[0_-10px_40px_rgba(0,0,0,0.02)] ${activeModule === 'Graph' ? 'hidden' : ''}`}>
                    <div className="max-w-4xl mx-auto">
                        {/* DYNAMIC INVESTIGATE & RECOMMEND CHIPS */}
                        <div className="mb-6 space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            {/* Investigate Section */}
                            {MODULE_DATA[activeModule].investigate.length > 0 && (
                                <div className="flex flex-col gap-2">
                                    <div className="flex items-center gap-2 px-1">
                                        <ShieldAlert size={12} className="text-red-400" />
                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Investigate</span>
                                    </div>
                                    <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                                        {MODULE_DATA[activeModule].investigate.map((item, idx) => (
                                            <button
                                                key={idx}
                                                onClick={() => handleSend(item.query)}
                                                className="whitespace-nowrap flex flex-col items-start gap-1 px-4 py-2.5 rounded-xl bg-white border border-red-100 text-red-600 hover:bg-red-600 hover:text-white transition-all shadow-sm active:scale-95 group"
                                            >
                                                <div className="flex items-center gap-2 font-bold text-[11px]">
                                                    {item.label}
                                                </div>
                                                {item.desc && (
                                                    <span className="text-[9px] opacity-70 font-medium group-hover:text-red-50 truncate max-w-[200px]">
                                                        {item.desc}
                                                    </span>
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {/* Recommend Section */}
                            {MODULE_DATA[activeModule].recommendations.length > 0 && (
                                <div className="flex flex-col gap-2">
                                    <div className="flex items-center gap-2 px-1">
                                        <TrendingUp size={12} className="text-teal-500" />
                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Recommend</span>
                                    </div>
                                    <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                                        {MODULE_DATA[activeModule].recommendations.map((item, idx) => (
                                            <button
                                                key={idx}
                                                onClick={() => handleSend(item.query)}
                                                className="whitespace-nowrap flex flex-col items-start gap-1 px-4 py-2.5 rounded-xl bg-teal-50 border border-teal-100 text-teal-700 hover:bg-teal-600 hover:text-white transition-all shadow-sm active:scale-95 group"
                                            >
                                                <div className="flex items-center gap-2 font-bold text-[11px]">
                                                    {item.label}
                                                </div>
                                                {item.desc && (
                                                    <span className="text-[9px] opacity-70 font-medium group-hover:text-teal-50 truncate max-w-[200px]">
                                                        {item.desc}
                                                    </span>
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                        {/* Input Wrapper */}
                        <div className="relative shadow-2xl shadow-teal-900/5 rounded-2xl group transition-transform hover:scale-[1.002]">
                            <div className="absolute inset-y-0 left-6 flex items-center pointer-events-none">
                                <MessageSquare size={18} className="text-slate-300 group-focus-within:text-teal-500 transition-colors" />
                            </div>
                            <input
                                type="text"
                                value={inputText}
                                onChange={(e) => setInputText(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSend(inputText)}
                                placeholder={`Query Wizechat about ${activeModule}...`}
                                disabled={isProcessing}
                                className="w-full bg-white border border-slate-200 text-slate-800 pl-14 pr-24 py-5 rounded-2xl focus:outline-none focus:border-teal-500 focus:ring-8 focus:ring-teal-500/5 transition-all placeholder:text-slate-300 text-sm font-semibold"
                            />
                            <div className="absolute right-3 top-3 bottom-3 flex items-center">
                                <button
                                    onClick={() => handleSend(inputText)}
                                    disabled={!inputText.trim() || isProcessing}
                                    className="h-full px-6 bg-teal-600 hover:bg-teal-700 disabled:bg-slate-100 disabled:text-slate-300 text-white rounded-xl flex items-center justify-center transition-all shadow-lg shadow-teal-600/30 active:scale-95"
                                >
                                    {isProcessing ? (
                                        <Clock size={20} className="animate-spin" />
                                    ) : (
                                        <div className="flex items-center gap-2 font-bold text-xs"> SEND <Send size={14} />
                                        </div>)}
                                </button>
                            </div>
                        </div>
                        <div className="flex justify-between items-center mt-5 px-2">
                            <div className="flex items-center gap-4">
                                <span className="text-[9px] text-slate-400 font-black uppercase tracking-widest flex items-center gap-1">
                                    <Database size={10} /> FalkorDB Engine v2.4
                                </span>
                                <span className="text-[9px] text-slate-400 font-black uppercase tracking-widest flex items-center gap-1">
                                    <Activity size={10} /> Latency: 1.2s
                                </span>
                            </div>
                            <p className="text-[9px] text-slate-400 font-bold italic">Shift: Morning | Station: Alpha-1</p> </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

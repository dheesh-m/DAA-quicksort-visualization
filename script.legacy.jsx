import React, { useCallback, useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import { gsap } from "gsap";

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomArray(size = 14) {
    const generated = [];
    for (let i = 0; i < size; i += 1) {
        generated.push(Math.floor(Math.random() * 95) + 5);
    }
    return generated;
}

function parseInputArray(inputValue) {
    return inputValue
        .split(",")
        .map((n) => Number(n.trim()))
        .filter((n) => Number.isFinite(n));
}

function QuickSortApp() {
    const [inputValue, setInputValue] = useState("12,4,19,7,3,15,2,10,8");
    const [bars, setBars] = useState([]);
    const [arraySize, setArraySize] = useState(14);
    const [speed, setSpeed] = useState(500);
    const [status, setStatus] = useState("Ready.");
    const [isSorting, setIsSorting] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [tick, setTick] = useState(0);

    const dataRef = useRef([]);
    const initialSnapshotRef = useRef([]);
    const sortedRef = useRef(new Set());
    const phaseRef = useRef({ compareA: -1, compareB: -1, pivot: -1, swapA: -1, swapB: -1 });
    const cancelRef = useRef(false);
    const isPausedRef = useRef(false);

    const getHeight = useCallback((value, maxValue) => {
        const safeMax = Math.max(1, maxValue);
        return Math.max(18, (value / safeMax) * 320);
    }, []);

    const currentBarClass = useCallback((idx) => {
        if (sortedRef.current.has(idx)) return "bar bar-sorted";
        if (idx === phaseRef.current.swapA || idx === phaseRef.current.swapB) return "bar bar-swap";
        if (idx === phaseRef.current.pivot) return "bar bar-pivot";
        if (idx === phaseRef.current.compareA || idx === phaseRef.current.compareB) return "bar bar-compare";
        return "bar";
    }, []);

    const renderFromArray = useCallback((nextArr) => {
        const max = Math.max(...nextArr, 1);
        setBars(
            nextArr.map((value, idx) => ({
                index: idx,
                value,
                height: getHeight(value, max),
                className: currentBarClass(idx)
            }))
        );
    }, [currentBarClass, getHeight]);

    const refreshBars = useCallback(() => {
        renderFromArray([...dataRef.current]);
        setTick((t) => t + 1);
    }, [renderFromArray]);

    async function pauseGate() {
        while (isPausedRef.current && !cancelRef.current) {
            await sleep(80);
        }
    }

    async function animatePulse(indices) {
        const targets = indices
            .map((idx) => document.querySelector(`[data-index="${idx}"]`))
            .filter(Boolean);
        if (!targets.length) return;
        await gsap.to(targets, {
            scaleY: 1.08,
            duration: 0.16,
            yoyo: true,
            repeat: 1
        });
    }

    async function animateSwap(i, j) {
        const first = document.querySelector(`[data-index="${i}"]`);
        const second = document.querySelector(`[data-index="${j}"]`);
        if (!first || !second || i === j) return;

        const firstRect = first.getBoundingClientRect();
        const secondRect = second.getBoundingClientRect();
        const deltaX = secondRect.left - firstRect.left;

        const tl = gsap.timeline();
        tl.to([first, second], {
            y: -20,
            duration: 0.14,
            ease: "power2.out"
        });
        tl.to(first, {
            x: deltaX,
            duration: 0.24,
            ease: "power2.inOut"
        }, 0.14);
        tl.to(second, {
            x: -deltaX,
            duration: 0.24,
            ease: "power2.inOut"
        }, 0.14);
        tl.to([first, second], {
            y: 0,
            duration: 0.14,
            ease: "power2.in"
        }, 0.38);
        tl.set([first, second], { x: 0, clearProps: "transform" });
        await tl;
    }

    async function markCompare(i, j, pivotIdx) {
        phaseRef.current = { compareA: i, compareB: j, pivot: pivotIdx, swapA: -1, swapB: -1 };
        refreshBars();
        setStatus(`Comparing ${dataRef.current[j]} with pivot ${dataRef.current[pivotIdx]}`);
        await animatePulse([i, j].filter((n) => n >= 0));
        await sleep(speed);
        await pauseGate();
    }

    async function markSwap(i, j, pivotIdx) {
        phaseRef.current = { compareA: -1, compareB: -1, pivot: pivotIdx, swapA: i, swapB: j };
        refreshBars();
        setStatus(`Swapping ${dataRef.current[i]} and ${dataRef.current[j]}`);
        await animateSwap(i, j);
        await sleep(Math.max(120, Math.floor(speed * 0.45)));
        await pauseGate();
    }

    function clearPhases() {
        phaseRef.current = { compareA: -1, compareB: -1, pivot: -1, swapA: -1, swapB: -1 };
    }

    function markSorted(idx) {
        sortedRef.current.add(idx);
        refreshBars();
    }

    async function partition(low, high) {
        const pivot = dataRef.current[high];
        let i = low - 1;
        setStatus(`Partitioning ${low}..${high} (pivot ${pivot})`);

        for (let j = low; j < high; j += 1) {
            if (cancelRef.current) return i + 1;
            await markCompare(i, j, high);
            if (dataRef.current[j] < pivot) {
                i += 1;
                await markSwap(i, j, high);
                [dataRef.current[i], dataRef.current[j]] = [dataRef.current[j], dataRef.current[i]];
                clearPhases();
                refreshBars();
            }
        }

        await markSwap(i + 1, high, high);
        [dataRef.current[i + 1], dataRef.current[high]] = [dataRef.current[high], dataRef.current[i + 1]];
        clearPhases();
        refreshBars();
        markSorted(i + 1);
        return i + 1;
    }

    async function quickSort(low, high) {
        await pauseGate();
        if (cancelRef.current) return;
        if (low < high) {
            const pivotIndex = await partition(low, high);
            await quickSort(low, pivotIndex - 1);
            await quickSort(pivotIndex + 1, high);
        } else if (low === high) {
            markSorted(low);
        }
    }

    async function handleStartSort() {
        const values = parseInputArray(inputValue);
        if (values.length < 2) {
            setStatus("Enter at least 2 valid numbers separated by commas.");
            return;
        }

        setIsSorting(true);
        setIsPaused(false);
        cancelRef.current = false;
        sortedRef.current.clear();
        clearPhases();
        dataRef.current = [...values];
        initialSnapshotRef.current = [...values];
        refreshBars();
        setStatus("Sorting started...");

        await quickSort(0, dataRef.current.length - 1);

        if (!cancelRef.current) {
            sortedRef.current = new Set(dataRef.current.map((_, idx) => idx));
            clearPhases();
            refreshBars();
            setStatus(`Finished! Sorted array: ${dataRef.current.join(", ")}`);
        }

        setIsSorting(false);
        setIsPaused(false);
    }

    function handleGenerate() {
        if (isSorting) return;
        const generated = randomArray(arraySize);
        setInputValue(generated.join(", "));
        dataRef.current = [...generated];
        initialSnapshotRef.current = [...generated];
        sortedRef.current.clear();
        clearPhases();
        refreshBars();
        setStatus("Random array generated. Press Start Sorting.");
    }

    function handleReset() {
        cancelRef.current = true;
        isPausedRef.current = false;
        setIsSorting(false);
        setIsPaused(false);
        sortedRef.current.clear();
        clearPhases();
        dataRef.current = [...initialSnapshotRef.current];
        refreshBars();
        setStatus("Reset complete.");
    }

    useEffect(() => {
        const generated = randomArray(arraySize);
        setInputValue(generated.join(", "));
        dataRef.current = [...generated];
        initialSnapshotRef.current = [...generated];
        refreshBars();
        setStatus("Random array generated. Press Start Sorting.");
    }, [arraySize, refreshBars]);

    useEffect(() => {
        isPausedRef.current = isPaused;
    }, [isPaused]);

    useEffect(() => {
        if (!isSorting) return;
        if (!isPaused) return;
        setStatus("Paused.");
    }, [isPaused, isSorting]);

    return (
        <div className="container py-4 py-md-5">
            <div className="card app-card mx-auto shadow-lg">
                <div className="card-body p-4 p-md-5">
                    <h1 className="display-6 fw-bold mb-3">Quick Sort Visualizer </h1>
                    <p className="text-secondary mb-4">
                        Dynamic state-driven visualization with smooth one-by-one quicksort transitions.
                    </p>
                    <div className="row g-3 align-items-end controls-wrap mb-4">
                        <div className="col-12 col-md-8">
                            <label htmlFor="arrayInput" className="form-label">Array values (comma separated)</label>
                            <input
                                id="arrayInput"
                                type="text"
                                className="form-control form-control-lg"
                                value={inputValue}
                                disabled={isSorting}
                                onChange={(e) => setInputValue(e.target.value)}
                                placeholder="Example: 5,3,8,1,9"
                            />
                        </div>
                        <div className="col-6 col-md-2">
                            <label htmlFor="speedRange" className="form-label">Speed</label>
                            <input
                                id="speedRange"
                                type="range"
                                className="form-range"
                                min="120"
                                max="1200"
                                step="20"
                                value={speed}
                                onChange={(e) => setSpeed(Number(e.target.value))}
                            />
                        </div>
                        <div className="col-12 col-md-8">
                            <label htmlFor="sizeRange" className="form-label">Array size</label>
                            <input
                                id="sizeRange"
                                type="range"
                                className="form-range"
                                min="6"
                                max="40"
                                step="1"
                                value={arraySize}
                                disabled={isSorting}
                                onChange={(e) => setArraySize(Number(e.target.value))}
                            />
                        </div>
                        <div className="col-12 col-md-4 text-md-end">
                            <span className="badge text-bg-danger px-3 py-2">{arraySize} bars</span>
                        </div>
                    </div>
                    <div className="d-flex flex-wrap gap-2 mb-3">
                        <button className="btn btn-outline-info glass-btn" disabled={isSorting} onClick={handleGenerate}>Generate Random</button>
                        <button className="btn btn-info fw-semibold glass-btn" disabled={isSorting} onClick={handleStartSort}>Start Sorting</button>
                        <button
                            className="btn btn-outline-warning glass-btn"
                            disabled={!isSorting || isPaused}
                            onClick={() => {
                                setIsPaused(true);
                                setStatus("Paused.");
                            }}
                        >
                            Pause
                        </button>
                        <button
                            className="btn btn-outline-success glass-btn"
                            disabled={!isSorting || !isPaused}
                            onClick={() => {
                                setIsPaused(false);
                                setStatus("Resumed.");
                            }}
                        >
                            Resume
                        </button>
                        <button className="btn btn-outline-light glass-btn" onClick={handleReset}>Reset</button>
                    </div>
                    <div className="legend mb-3">
                        <span><i className="dot dot-default"></i> Normal</span>
                        <span><i className="dot dot-pivot"></i> Pivot</span>
                        <span><i className="dot dot-compare"></i> Comparing</span>
                        <span><i className="dot dot-swap"></i> Swapping</span>
                        <span><i className="dot dot-sorted"></i> Sorted</span>
                    </div>
                    <div className="small text-info mb-2">{status}</div>
                    <div className="bars-area">
                        {bars.map((bar) => (
                            <div
                                key={`${bar.index}-${bar.value}-${tick}`}
                                data-index={bar.index}
                                data-value={bar.value}
                                className={bar.className}
                                style={{ height: `${bar.height}px`, transition: "height 280ms ease, filter 180ms ease" }}
                            />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

export { QuickSortApp };

ReactDOM.createRoot(document.getElementById("root")).render(<QuickSortApp />);

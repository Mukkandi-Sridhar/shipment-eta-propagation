# 5-minute demo script

Record with `make serve` running and the dashboard at http://localhost:8000 (full-screen browser, 1440p or above).

| Time | Screen | Say |
|---|---|---|
| 0:00–0:30 | **Command center**, globe replaying | "ETA isn't one number. Delay starts in one stage and spreads to the next. I modelled a shipment as five stages and predict each stage's overrun from how late the shipment enters it. Chaining those predictions makes the delay propagate." |
| 0:30–1:00 | Drag the globe, click a red ship | "This is 300 simulated journeys on nine real lanes. Port congestion and weather are shared time series, so ships in the same port in the same week suffer together. Red ships will deliver more than three days late." |
| 1:00–2:30 | **Shipment intelligence**: press *Replay journey* | "At booking the window is wide; it's a risk score more than a date. As the vessel departs and arrives, the window narrows. The waterfall splits each future stage into new delay (violet) and knock-on (red/green). Here, arriving 30 hours late costs another 14 hours at the port, because the vessel lost its berth window. The attribution bars add up exactly to the forecast, and the briefing text is generated only from those numbers." |
| 2:30–3:15 | What-if panel: raise port utilisation, add 48h upstream delay, toggle docs | "The chain is re-run live. Upstream delay hurts much more in a congested port. That interaction is learned, not hand-coded. Completing the documents is a concrete action, and the model estimates how many hours it saves." |
| 3:15–3:40 | Toggle *Reveal actual* | "This is synthetic data, so I know the true causes. The model pointed at the right stage." |
| 3:40–4:20 | **Propagation lab** | "Propagation curves: transshipment lanes jump once the hub buffer is gone. Long direct lanes absorb small delays. The heatmaps show the congestion × lateness interaction and the Friday-evening customs cliff, both learned from data." |
| 4:20–5:00 | **Evaluation** | "Temporal hold-out. The stage chain wins once there are milestones to propagate from: after arrival, 26h error vs 35h for the carrier schedule. At booking nothing beats the schedule by much, and I say so. Root-cause stage accuracy is 52% vs 12% for lane history. The limitations are in the report." |

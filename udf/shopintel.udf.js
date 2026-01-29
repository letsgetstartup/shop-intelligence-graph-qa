
// shopintel.udf.js
const ShopIntel = {
    downtimeCost: function (durationSec, ratePerHour) {
        // durationSec: integer seconds
        // ratePerHour: float currency per hour
        if (durationSec == null || ratePerHour == null) return 0.0;
        const hours = durationSec / 3600.0;
        return Math.round(hours * ratePerHour * 100) / 100;
    },

    jobLateRisk: function (dueTs, closeTs, qtyRemaining) {
        // dueTs: milliseconds since epoch (nullable)
        // closeTs: same (nullable)
        // qtyRemaining: int

        const now = Date.now();
        const due = (dueTs === null ? 0 : dueTs);
        // If closeTs is null, job is open, so effective "done point" is now.
        // But logic: "is it late?"

        // If closed (closeTs != null), we can compute if it WAS late, or just return 0 risk?
        // Usually risk implies future or current problem.
        if (closeTs !== null) {
            // Already closed. Risk is 0 (or we could return 1 if it WAS late, but prompt implies 'risk')
            return 0.0;
        }

        if (qtyRemaining <= 0) return 0.0; // Completed but maybe not closed yet?

        // Job is open and incomplete
        if (now > due) {
            return 1.0; // Already late
        }

        const timeLeft = due - now;
        const dayMs = 24 * 3600 * 1000;

        if (timeLeft < dayMs) return 0.8; // < 1 day left
        if (timeLeft < 3 * dayMs) return 0.5; // < 3 days left
        return 0.2; // plenty of time
    },

    scrapCost: function (stdMaterialCost, qtyScrapped) {
        if (stdMaterialCost == null || qtyScrapped == null) return 0.0;
        return stdMaterialCost * qtyScrapped;
    },

    toolWearRisk: function (toolLifeRatio) {
        if (toolLifeRatio === null) return 0.0;
        if (toolLifeRatio < 0.5) return 0.1;
        if (toolLifeRatio < 0.8) return 0.5;
        if (toolLifeRatio < 1.0) return 0.9;
        return 1.0;
    }
}

// In FalkorDB JS UDFs, we simply export the functions or register them if the env requires.
// The docs say "falkor.register". 
// But when loading via client `udfLoad`, it usually wraps or expects just the code.
// The user provided example shows `falkor.register`.
// We need to assume the environment provides `falkor`.

if (typeof falkor !== 'undefined') {
    falkor.register('downtimeCost', ShopIntel.downtimeCost);
    falkor.register('jobLateRisk', ShopIntel.jobLateRisk);
    falkor.register('scrapCost', ShopIntel.scrapCost);
    falkor.register('toolWearRisk', ShopIntel.toolWearRisk);
}

// Export for testing if needed
if (typeof module !== 'undefined') {
    module.exports = ShopIntel;
}

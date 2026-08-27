import { getIndustries, getScoringCriteria } from "./master-data";

Promise.all([getIndustries(), getScoringCriteria()])
  .then(([industries, criteria]) => {
    const weightTotal = criteria.reduce((sum, criterion) => sum + Number(criterion.weight), 0);
    console.log(
      JSON.stringify({
        industriesReturned: industries.length,
        scoringCriteriaReturned: criteria.length,
        scoringWeightTotal: weightTotal,
      }),
    );
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.log(JSON.stringify({ error: message }));
    process.exitCode = 1;
  });

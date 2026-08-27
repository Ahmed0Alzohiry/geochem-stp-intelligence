import { hypotheticalPetrochemicalExample, SCHEMA_GAPS, COMMERCIAL_WEIGHT_TOTAL } from "./index";

const example = hypotheticalPetrochemicalExample();
console.log(
  JSON.stringify(
    {
      databaseWrites: 0,
      scoresWritten: 0,
      weightsSumTo100: example.weightsSumTo100,
      commercialWeightTotal: COMMERCIAL_WEIGHT_TOTAL,
      schemaGaps: SCHEMA_GAPS,
      hypothetical: example.result,
    },
    null,
    2,
  ),
);

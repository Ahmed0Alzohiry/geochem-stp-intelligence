import { testIndustriesConnection } from "./test-connection";

testIndustriesConnection()
  .then((result) => {
    console.log(JSON.stringify(result));
    if (!result.ok) {
      process.exitCode = 2;
    }
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown connection error";
    console.log(
      JSON.stringify({
        ok: false,
        rlsBlocked: false,
        industriesReturned: 0,
        names: [],
        error: message,
      }),
    );
    process.exitCode = 1;
  });

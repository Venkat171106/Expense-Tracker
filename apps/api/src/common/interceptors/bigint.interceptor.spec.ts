import { BigIntInterceptor } from "./bigint.interceptor";
import { of } from "rxjs";

describe("BigIntInterceptor", () => {
  let interceptor: BigIntInterceptor;

  beforeEach(() => {
    interceptor = new BigIntInterceptor();
  });

  it("should serialize BigInt values to strings without TypeError", (done) => {
    const input = {
      amount: BigInt(50000),
      currency: "INR",
      nested: {
        value: BigInt(3000000),
      },
      list: [BigInt(500000), BigInt(-200000)],
    };

    const callHandler = {
      handle: () => of(input),
    };

    interceptor.intercept({} as any, callHandler as any).subscribe((result) => {
      expect(result).toEqual({
        amount: "50000",
        currency: "INR",
        nested: {
          value: "3000000",
        },
        list: ["500000", "-200000"],
      });
      // VERIFY JSON.stringify works with zero TypeError
      expect(() => JSON.stringify(result)).not.toThrow();
      done();
    });
  });
});

import v4 = require('uuid/v4');
import v5 = require("uuid/v5");

export class Utils {

    public static GenerateGuid(): string {
        return v4();
    }

    public static GenerateDeterministicGuid(seed: string): string {
        return v5(seed, v5.URL);
    }
}
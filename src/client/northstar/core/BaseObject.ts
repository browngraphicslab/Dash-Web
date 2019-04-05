import { IEquatable } from '../utils/IEquatable'
import { IDisposable } from '../utils/IDisposable'

export class BaseObject implements IEquatable, IDisposable {

    public Equals(other: Object): boolean {
        return this === other;
    }

    public Dispose(): void {
    }
}
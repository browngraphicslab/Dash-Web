import * as React from 'react';
import { Doc } from '../../new_fields/Doc';
import { computed } from 'mobx';
import { Touchable } from './Touchable';

export function DocComponent<P extends { Document: Doc }, T>(schemaCtor: (doc: Doc) => T) {
    class Component extends Touchable<P> {
        //TODO This might be pretty inefficient if doc isn't observed, because computed doesn't cache then
        @computed
        get Document(): T {
            return schemaCtor(this.props.Document);
        }
    }
    return Component;
}
import * as React from 'react';
import { Doc } from '../../new_fields/Doc';
import { computed } from 'mobx';

export function DocComponent<P extends { Document: Doc }, T>(schemaCtor: (doc: Doc) => T) {
    class Component extends React.Component<P> {
        //TODO This might be pretty inefficient if doc isn't observed, because computed doesn't cache then
        @computed
        get Document() {
            return schemaCtor(this.props.Document);
        }
    }
    return Component;
}
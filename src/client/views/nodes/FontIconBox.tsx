import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { observer } from 'mobx-react';
import * as React from 'react';
import { createSchema, makeInterface } from '../../../new_fields/Schema';
import { DocComponent } from '../DocComponent';
import './FontIconBox.scss';
import { FieldView, FieldViewProps } from './FieldView';
const FontIconSchema = createSchema({
    icon: "string"
});

type FontIconDocument = makeInterface<[typeof FontIconSchema]>;
const FontIconDocument = makeInterface(FontIconSchema);
@observer
export class FontIconBox extends DocComponent<FieldViewProps, FontIconDocument>(FontIconDocument) {
    public static LayoutString() { return FieldView.LayoutString(FontIconBox); }

    render() {
        return <div className="fontIconBox-outerDiv" >  <FontAwesomeIcon className="fontIconBox-icon" icon={this.Document.icon as any} size="lg" color="white" />  </div>;
    }
}
import * as React from 'react';
import { FieldViewProps, FieldView } from './FieldView';
import { createSchema, makeInterface } from '../../../new_fields/Schema';
import { ScriptField } from '../../../new_fields/ScriptField';
import { DocComponent } from '../DocComponent';
import { ContextMenu } from '../ContextMenu';
import { library } from '@fortawesome/fontawesome-svg-core';
import { faEdit } from '@fortawesome/free-regular-svg-icons';
import { emptyFunction } from '../../../Utils';
import { ScriptBox } from '../ScriptBox';
import { CompileScript } from '../../util/Scripting';
import { OverlayView } from '../OverlayView';
import { Doc } from '../../../new_fields/Doc';

import './ButtonBox.scss';
import { observer } from 'mobx-react';
import { DocumentIconContainer } from './DocumentIcon';
import { StrCast } from '../../../new_fields/Types';

library.add(faEdit as any);

const ButtonSchema = createSchema({
    onClick: ScriptField,
    text: "string"
});

type ButtonDocument = makeInterface<[typeof ButtonSchema]>;
const ButtonDocument = makeInterface(ButtonSchema);

@observer
export class ButtonBox extends DocComponent<FieldViewProps, ButtonDocument>(ButtonDocument) {
    public static LayoutString() { return FieldView.LayoutString(ButtonBox); }

    render() {
        return (
            <div className="buttonBox-outerDiv" >
                <div className="buttonBox-mainButton" style={{ background: StrCast(this.props.Document.backgroundColor), color: StrCast(this.props.Document.color, "black") }} >{this.Document.text || this.Document.title}</div>
            </div>
        );
    }
}
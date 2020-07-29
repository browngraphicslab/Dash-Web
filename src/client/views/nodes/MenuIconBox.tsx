import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { observer } from 'mobx-react';
import * as React from 'react';
import { createSchema, makeInterface } from '../../../fields/Schema';
import { DocComponent } from '../DocComponent';
import './MenuIconBox.scss';
import { FieldView, FieldViewProps } from './FieldView';
import { StrCast, Cast, NumCast } from '../../../fields/Types';
import { Utils } from "../../../Utils";
import { runInAction, observable, reaction, IReactionDisposer } from 'mobx';
import { Doc } from '../../../fields/Doc';
import { ScriptField } from '../../../fields/ScriptField';
import { CurrentUserUtils } from '../../util/CurrentUserUtils';
const MenuIconSchema = createSchema({
    icon: "string"
});

type MenuIconDocument = makeInterface<[typeof MenuIconSchema]>;
const MenuIconDocument = makeInterface(MenuIconSchema);
@observer
export class MenuIconBox extends DocComponent<FieldViewProps, MenuIconDocument>(MenuIconDocument) {
    public static LayoutString(fieldKey: string) { return FieldView.LayoutString(MenuIconBox, fieldKey); }
    _ref: React.RefObject<HTMLButtonElement> = React.createRef();

    render() {

        const menuBTN = <div className="menuButton" style={{ backgroundColor: CurrentUserUtils.panelContent === this.dataDoc.title ? "lightgrey" : "" }}>
            <div className="menuButton-wrap"
                style={{ backgroundColor: CurrentUserUtils.panelContent === this.dataDoc.title ? "lightgrey" : "" }}
            //onPointerDown={this.dataDoc.click}
            >
                <FontAwesomeIcon className="menuButton-icon" icon={StrCast(this.dataDoc.icon, "user") as any}
                    color={CurrentUserUtils.panelContent === this.dataDoc.title ? "black" : "white"} size="lg" />
                <div className="menuButton-label"
                    style={{ color: CurrentUserUtils.panelContent === this.dataDoc.title ? "black" : "white" }}> {this.dataDoc.title} </div>
            </div>
        </div>;

        return menuBTN;
    }
}
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { observer } from 'mobx-react';
import * as React from 'react';
import { createSchema, makeInterface } from '../../../fields/Schema';
import { StrCast } from '../../../fields/Types';
import { DocComponent } from '../DocComponent';
import { FieldView, FieldViewProps } from './FieldView';
import './MenuIconBox.scss';
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

        const color = this.props.backgroundColor?.(this.props.Document) === "lightgrey" ? "black" : "white";
        const menuBTN = <div className="menuButton" style={{ backgroundColor: this.props.backgroundColor?.(this.props.Document) }}>
            <div className="menuButton-wrap"
                style={{ backgroundColor: this.props.backgroundColor?.(this.props.Document) }} >
                <FontAwesomeIcon className="menuButton-icon" icon={StrCast(this.dataDoc.icon, "user") as any} color={color} size="lg" />
                <div className="menuButton-label" style={{ color: color }}> {this.dataDoc.title} </div>
            </div>
        </div>;

        return menuBTN;
    }
}
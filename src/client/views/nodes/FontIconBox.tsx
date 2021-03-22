import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Tooltip } from '@material-ui/core';
import { observer } from 'mobx-react';
import * as React from 'react';
import { AclPrivate, Doc, DocListCast } from '../../../fields/Doc';
import { createSchema, makeInterface } from '../../../fields/Schema';
import { ScriptField } from '../../../fields/ScriptField';
import { BoolCast, Cast, StrCast } from '../../../fields/Types';
import { GetEffectiveAcl } from '../../../fields/util';
import { emptyFunction, returnFalse, setupMoveUpEvents } from "../../../Utils";
import { DragManager } from '../../util/DragManager';
import { ContextMenu } from '../ContextMenu';
import { DocComponent } from '../DocComponent';
import { StyleProp } from '../StyleProvider';
import { FieldView, FieldViewProps } from './FieldView';
import './FontIconBox.scss';
const FontIconSchema = createSchema({
    icon: "string",
});

export enum ButtonType {
    MenuButton = "menuBtn",
    DropdownButton = "drpDownBtn",
    ClickButton = "clickBtn",
    DoubleButton = "dblBtn"
}

type FontIconDocument = makeInterface<[typeof FontIconSchema]>;
const FontIconDocument = makeInterface(FontIconSchema);
@observer
export class FontIconBox extends DocComponent<FieldViewProps, FontIconDocument>(FontIconDocument) {
    public static LayoutString(fieldKey: string) { return FieldView.LayoutString(FontIconBox, fieldKey); }
    showTemplate = (): void => {
        const dragFactory = Cast(this.layoutDoc.dragFactory, Doc, null);
        dragFactory && this.props.addDocTab(dragFactory, "add:right");
    }
    dragAsTemplate = (): void => { this.layoutDoc.onDragStart = ScriptField.MakeFunction('getCopy(this.dragFactory, true)'); };
    useAsPrototype = (): void => { this.layoutDoc.onDragStart = ScriptField.MakeFunction('makeDelegate(this.dragFactory, true)'); };

    specificContextMenu = (): void => {
        if (!Doc.UserDoc().noviceMode) {
            const cm = ContextMenu.Instance;
            cm.addItem({ description: "Show Template", event: this.showTemplate, icon: "tag" });
            cm.addItem({ description: "Use as Render Template", event: this.dragAsTemplate, icon: "tag" });
            cm.addItem({ description: "Use as Prototype", event: this.useAsPrototype, icon: "tag" });
        }
    }

    /**
     * Types of buttons in dash:
     * - Main menu button (LHS)
     * - Tool button
     * - Expandable button (CollectionLinearView)
     * - Button inside of CollectionLinearView vs. outside of CollectionLinearView
     * - Action button
     * - Dropdown button
    **/

    render() {
        /**
         * Menu Panel Button: mainBtn
         * Dropdown Button: dropDownBtn
         * doubleBtn
        **/
        const type = StrCast(this.rootDoc.btnType);
        const hideLabel: boolean = BoolCast(this.rootDoc.hideLabel);

        const label = StrCast(this.rootDoc.label, StrCast(this.rootDoc.title));
        const color = this.props.styleProvider?.(this.rootDoc, this.props, StyleProp.Color);
        const backgroundColor = this.props.styleProvider?.(this.rootDoc, this.props, StyleProp.BackgroundColor);
        // const shape = StrCast(this.layoutDoc.iconShape, label ? "round" : "circle");
        const icon = StrCast(this.dataDoc.icon, "user") as any;
        const presSize = type === ButtonType.MenuButton ? 30 : 25;
        const presTrailsIcon = <img src={`/assets/${"presTrails.png"}`}
            style={{ width: presSize, height: presSize, filter: `invert(${color === "white" ? "100%" : "0%"})`, marginBottom: "5px" }} />;


        const button = <button className={`menuButton${type ? "-" + type : ""}`} onContextMenu={this.specificContextMenu}
            style={{ backgroundColor: backgroundColor, }}>
            <div className="menuButton-wrap">
                {icon === 'pres-trail' ? presTrailsIcon : <FontAwesomeIcon className={`menuButton-icon-${type}`} icon={icon} color={color}
                    size={"sm"} />}
                {!label ? (null) : <div className="fontIconBox-label" style={{ color, backgroundColor }}> {label} </div>}
                <FontIconBadge collection={Cast(this.rootDoc.watchedDocuments, Doc, null)} />
            </div>
        </button>;

        return !this.layoutDoc.toolTip ? button :
            <Tooltip title={<div className="dash-tooltip">{StrCast(this.layoutDoc.toolTip)}</div>}>
                {button}
            </Tooltip>;
    }
}

interface FontIconBadgeProps {
    collection: Doc | undefined;
}

@observer
export class FontIconBadge extends React.Component<FontIconBadgeProps> {
    _notifsRef = React.createRef<HTMLDivElement>();

    onPointerDown = (e: React.PointerEvent) => {
        setupMoveUpEvents(this, e,
            (e: PointerEvent) => {
                const dragData = new DragManager.DocumentDragData([this.props.collection!]);
                DragManager.StartDocumentDrag([this._notifsRef.current!], dragData, e.x, e.y);
                return true;
            },
            returnFalse, emptyFunction, false);
    }

    render() {
        if (!(this.props.collection instanceof Doc)) return (null);
        const length = DocListCast(this.props.collection.data).filter(d => GetEffectiveAcl(d) !== AclPrivate).length; //  Object.keys(d).length).length; // filter out any documents that we can't read
        return <div className="fontIconBadge-container" style={{ width: 15, height: 15, top: 12 }} ref={this._notifsRef}>
            <div className="fontIconBadge" style={length > 0 ? { "display": "initial" } : { "display": "none" }}
                onPointerDown={this.onPointerDown} >
                {length}
            </div>
        </div>;
    }
}
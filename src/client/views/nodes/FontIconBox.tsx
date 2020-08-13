import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { observer } from 'mobx-react';
import * as React from 'react';
import { createSchema, makeInterface } from '../../../fields/Schema';
import { DocComponent } from '../DocComponent';
import './FontIconBox.scss';
import { FieldView, FieldViewProps } from './FieldView';
import { StrCast, Cast, ScriptCast } from '../../../fields/Types';
import { Utils, setupMoveUpEvents, returnFalse, emptyFunction } from "../../../Utils";
import { runInAction, observable, reaction, IReactionDisposer } from 'mobx';
import { Doc, DocListCast } from '../../../fields/Doc';
import { ContextMenu } from '../ContextMenu';
import { ScriptField } from '../../../fields/ScriptField';
import { Tooltip } from '@material-ui/core';
import { MainViewNotifs } from '../MainViewNotifs';
import { DragManager } from '../../util/DragManager';
const FontIconSchema = createSchema({
    icon: "string",
});

type FontIconDocument = makeInterface<[typeof FontIconSchema]>;
const FontIconDocument = makeInterface(FontIconSchema);
@observer
export class FontIconBox extends DocComponent<FieldViewProps, FontIconDocument>(FontIconDocument) {
    public static LayoutString(fieldKey: string) { return FieldView.LayoutString(FontIconBox, fieldKey); }
    @observable _foregroundColor = "white";
    _ref: React.RefObject<HTMLButtonElement> = React.createRef();
    _backgroundReaction: IReactionDisposer | undefined;
    componentDidMount() {
        this._backgroundReaction = reaction(() => this.layoutDoc.backgroundColor,
            () => {
                if (this._ref && this._ref.current) {
                    const col = Utils.fromRGBAstr(getComputedStyle(this._ref.current).backgroundColor);
                    const colsum = (col.r + col.g + col.b);
                    if (colsum / col.a > 600 || col.a < 0.25) runInAction(() => this._foregroundColor = "black");
                    else if (colsum / col.a <= 600 || col.a >= .25) runInAction(() => this._foregroundColor = "white");
                }
            }, { fireImmediately: true });
    }

    showTemplate = (): void => {
        const dragFactory = Cast(this.layoutDoc.dragFactory, Doc, null);
        dragFactory && this.props.addDocTab(dragFactory, "onRight");
    }
    dragAsTemplate = (): void => {
        this.layoutDoc.onDragStart = ScriptField.MakeFunction('getCopy(this.dragFactory, true)');
    }
    useAsPrototype = (): void => {
        this.layoutDoc.onDragStart = ScriptField.MakeFunction('makeDelegate(this.dragFactory, true)');
    }

    specificContextMenu = (): void => {
        const cm = ContextMenu.Instance;
        cm.addItem({ description: "Show Template", event: this.showTemplate, icon: "tag" });
        cm.addItem({ description: "Use as Render Template", event: this.dragAsTemplate, icon: "tag" });
        cm.addItem({ description: "Use as Prototype", event: this.useAsPrototype, icon: "tag" });
    }

    componentWillUnmount() {
        this._backgroundReaction?.();
    }

    render() {
        const label = StrCast(this.rootDoc.label, StrCast(this.rootDoc.title));
        const color = StrCast(this.layoutDoc.color, this._foregroundColor);
        const backgroundColor = StrCast(this.layoutDoc._backgroundColor, StrCast(this.rootDoc.backgroundColor, this.props.backgroundColor?.(this.rootDoc, this.props.renderDepth)));
        const shape = StrCast(this.layoutDoc.iconShape, "round");

        const button = <button className={`menuButton-${shape}`} ref={this._ref} onContextMenu={this.specificContextMenu}
            style={{
                boxShadow: this.layoutDoc.ischecked ? `4px 4px 12px black` : undefined,
                backgroundColor: this.layoutDoc.iconShape === "square" ? backgroundColor : "",
            }}>
            <div className="menuButton-wrap">
                {<FontAwesomeIcon className={`menuButton-icon-${shape}`} icon={StrCast(this.dataDoc.icon, "user") as any} color={color}
                    size={this.layoutDoc.iconShape === "square" ? "sm" : "lg"} />}
                {!label ? (null) : <div className="fontIconBox-label" style={{ color, backgroundColor }}> {label} </div>}
                {this.props.Document.watchedDocuments ? <FontIconBadge collection={Cast(this.props.Document.watchedDocuments, Doc, null)} /> : (null)}
            </div>
        </button>;
        return !this.layoutDoc.toolTip ? button :
            <Tooltip title={<div className="dash-tooltip">{StrCast(this.layoutDoc.toolTip)}</div>}>
                {button}
            </Tooltip>;
    }
}

interface FontIconBadgeProps {
    collection: Doc;
}

@observer
export class FontIconBadge extends React.Component<FontIconBadgeProps> {
    _notifsRef = React.createRef<HTMLDivElement>();

    onPointerDown = (e: React.PointerEvent) => {
        setupMoveUpEvents(this, e,
            (e: PointerEvent) => {
                const dragData = new DragManager.DocumentDragData([this.props.collection]);
                DragManager.StartDocumentDrag([this._notifsRef.current!], dragData, e.x, e.y);
                return true;
            },
            returnFalse, emptyFunction, false);
    }

    render() {
        if (!(this.props.collection instanceof Doc)) return (null);
        const length = DocListCast(this.props.collection.data).length;
        return <div className="fontIconBadge-container" style={{ width: 15, height: 15, top: 12 }} ref={this._notifsRef}>
            <div className="fontIconBadge" style={length > 0 ? { "display": "initial" } : { "display": "none" }}
                onPointerDown={this.onPointerDown} >
                {length}
            </div>
        </div>;
    }
}
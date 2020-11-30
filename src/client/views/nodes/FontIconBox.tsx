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
import { Doc, DocListCast, AclPrivate } from '../../../fields/Doc';
import { ContextMenu } from '../ContextMenu';
import { ScriptField } from '../../../fields/ScriptField';
import { Tooltip } from '@material-ui/core';
import { DragManager } from '../../util/DragManager';
import { GetEffectiveAcl } from '../../../fields/util';
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

    componentWillUnmount() {
        this._backgroundReaction?.();
    }

    render() {
        const label = StrCast(this.rootDoc.label, StrCast(this.rootDoc.title));
        const color = StrCast(this.layoutDoc.color, this._foregroundColor);
        const backgroundColor = this.props.styleProvider?.(this.rootDoc, this.props.renderDepth, "backgroundColor", this.props.layerProvider);
        const shape = StrCast(this.layoutDoc.iconShape, label ? "round" : "circle");
        const icon = StrCast(this.dataDoc.icon, "user") as any;
        const presSize = shape === 'round' ? 25 : 30;
        const presTrailsIcon = <img src={`/assets/${"presTrails.png"}`}
            style={{ width: presSize, height: presSize, filter: `invert(${color === "white" ? "100%" : "0%"})`, marginBottom: "5px" }} />;
        const button = <button className={`menuButton-${shape}`} ref={this._ref} onContextMenu={this.specificContextMenu}
            style={{
                boxShadow: this.layoutDoc.ischecked ? `4px 4px 12px black` : undefined,
                backgroundColor: this.layoutDoc.iconShape === "square" ? backgroundColor : "",
            }}>
            <div className="menuButton-wrap">
                {icon === 'pres-trail' ? presTrailsIcon : <FontAwesomeIcon className={`menuButton-icon-${shape}`} icon={icon} color={color}
                    size={this.layoutDoc.iconShape === "square" ? "sm" : "sm"} />}
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
        const length = DocListCast(this.props.collection.data).filter(d => GetEffectiveAcl(d) !== AclPrivate).length; //  Object.keys(d).length).length; // filter out any documents that we can't read
        return <div className="fontIconBadge-container" style={{ width: 15, height: 15, top: 12 }} ref={this._notifsRef}>
            <div className="fontIconBadge" style={length > 0 ? { "display": "initial" } : { "display": "none" }}
                onPointerDown={this.onPointerDown} >
                {length}
            </div>
        </div>;
    }
}
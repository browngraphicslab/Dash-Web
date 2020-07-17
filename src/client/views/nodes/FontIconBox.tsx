import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { observer } from 'mobx-react';
import * as React from 'react';
import { createSchema, makeInterface } from '../../../fields/Schema';
import { DocComponent } from '../DocComponent';
import './FontIconBox.scss';
import { FieldView, FieldViewProps } from './FieldView';
import { StrCast, Cast, NumCast } from '../../../fields/Types';
import { Utils } from "../../../Utils";
import { runInAction, observable, reaction, IReactionDisposer } from 'mobx';
import { Doc } from '../../../fields/Doc';
import { ContextMenu } from '../ContextMenu';
import { ScriptField } from '../../../fields/ScriptField';
import { Tooltip } from '@material-ui/core';
const FontIconSchema = createSchema({
    icon: "string"
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
        const referenceDoc = (this.layoutDoc.dragFactory instanceof Doc ? this.layoutDoc.dragFactory : this.layoutDoc);
        const refLayout = Doc.Layout(referenceDoc);
        return <Tooltip title={<div className="dash-tooltip">{StrCast(this.layoutDoc.toolTip)}</div>}>
            <button className="fontIconBox-outerDiv" ref={this._ref} onContextMenu={this.specificContextMenu}
                style={{
                    padding: Cast(this.layoutDoc._xPadding, "number", null),
                    background: StrCast(refLayout._backgroundColor, StrCast(refLayout.backgroundColor)),
                    boxShadow: this.layoutDoc.ischecked ? `4px 4px 12px black` : undefined
                }}>
                <FontAwesomeIcon className="fontIconBox-icon" icon={this.dataDoc.icon as any} color={StrCast(this.layoutDoc.color, this._foregroundColor)} size="sm" />
                {!this.rootDoc.title ? (null) : <div className="fontIconBox-label"> {StrCast(this.rootDoc.title).substring(0, 6)} </div>}
            </button>
        </Tooltip>;
    }
}
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { observer } from 'mobx-react';
import * as React from 'react';
import { createSchema, makeInterface } from '../../../new_fields/Schema';
import { DocComponent } from '../DocComponent';
import './FontIconBox.scss';
import { FieldView, FieldViewProps } from './FieldView';
import { StrCast, Cast } from '../../../new_fields/Types';
import { Utils } from "../../../Utils";
import { runInAction, observable, reaction, IReactionDisposer } from 'mobx';
import { Doc } from '../../../new_fields/Doc';
import { ContextMenu } from '../ContextMenu';
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
        this._backgroundReaction = reaction(() => this.props.Document.backgroundColor,
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
        const dragFactory = Cast(this.props.Document.dragFactory, Doc, null);
        dragFactory && this.props.addDocTab(dragFactory, "onRight");
    }

    specificContextMenu = (): void => {
        const cm = ContextMenu.Instance;
        cm.addItem({ description: "Show Template", event: this.showTemplate, icon: "tag" });
    }

    componentWillUnmount() {
        this._backgroundReaction?.();
    }

    render() {
        const referenceDoc = (this.props.Document.dragFactory instanceof Doc ? this.props.Document.dragFactory : this.props.Document);
        const referenceLayout = Doc.Layout(referenceDoc);
        return <button className="fontIconBox-outerDiv" title={StrCast(this.props.Document.title)} ref={this._ref} onContextMenu={this.specificContextMenu}
            style={{
                background: StrCast(referenceLayout.backgroundColor),
                boxShadow: this.props.Document.ischecked ? `4px 4px 12px black` : undefined
            }}>
            <FontAwesomeIcon className="fontIconBox-icon" icon={this.dataDoc.icon as any} color={this._foregroundColor} size="sm" />
        </button>;
    }
}
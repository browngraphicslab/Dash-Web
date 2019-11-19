import { action, observable } from "mobx";
import { observer } from "mobx-react";
import { DocumentManager } from "../util/DocumentManager";
import { DragManager } from "../util/DragManager";
import { SelectionManager } from "../util/SelectionManager";
import { undoBatch } from "../util/UndoManager";
import './DocumentDecorations.scss';
import { DocumentView } from "./nodes/DocumentView";
import { Template, Templates } from "./Templates";
import React = require("react");
import { Doc } from "../../new_fields/Doc";
import { StrCast } from "../../new_fields/Types";
import { emptyFunction } from "../../Utils";
const higflyout = require("@hig/flyout");
export const { anchorPoints } = higflyout;
export const Flyout = higflyout.default;

@observer
class TemplateToggle extends React.Component<{ template: Template, checked: boolean, toggle: (event: React.ChangeEvent<HTMLInputElement>, template: Template) => void }> {
    render() {
        if (this.props.template) {
            return (
                <li className="templateToggle">
                    <input type="checkbox" checked={this.props.checked} onChange={(event) => this.props.toggle(event, this.props.template)} />
                    {this.props.template.Name}
                </li>
            );
        } else {
            return (null);
        }
    }
}
@observer
class OtherToggle extends React.Component<{ checked: boolean, name: string, toggle: (event: React.ChangeEvent<HTMLInputElement>) => void }> {
    render() {
        return (
            <li className="chromeToggle">
                <input type="checkbox" checked={this.props.checked} onChange={(event) => this.props.toggle(event)} />
                {this.props.name}
            </li>
        );
    }
}

export interface TemplateMenuProps {
    docs: DocumentView[];
    templates: Map<Template, boolean>;
}


@observer
export class TemplateMenu extends React.Component<TemplateMenuProps> {
    @observable private _hidden: boolean = true;
    private _downx = 0;
    private _downy = 0;
    private _dragRef = React.createRef<HTMLUListElement>();

    toggleCustom = (e: React.ChangeEvent<HTMLInputElement>): void => {
        this.props.docs.map(dv => dv.setCustomView(e.target.checked));
    }

    toggleFloat = (e: React.ChangeEvent<HTMLInputElement>): void => {
        SelectionManager.DeselectAll();
        let topDocView = this.props.docs[0];
        let topDoc = topDocView.props.Document;
        let xf = topDocView.props.ScreenToLocalTransform();
        let ex = e.target.clientLeft;
        let ey = e.target.clientTop;
        undoBatch(action(() => topDoc.z = topDoc.z ? 0 : 1))();
        if (e.target.checked) {
            setTimeout(() => {
                let newDocView = DocumentManager.Instance.getDocumentView(topDoc);
                if (newDocView) {
                    let de = new DragManager.DocumentDragData([topDoc]);
                    de.moveDocument = topDocView.props.moveDocument;
                    let xf = newDocView.ContentDiv!.getBoundingClientRect();
                    DragManager.StartDocumentDrag([newDocView.ContentDiv!], de, ex, ey, {
                        offsetX: (ex - xf.left), offsetY: (ey - xf.top),
                        handlers: { dragComplete: () => { }, },
                        hideSource: false
                    });
                }
            }, 10);
        } else if (topDocView.props.ContainingCollectionView) {
            let collView = topDocView.props.ContainingCollectionView;
            let [sx, sy] = xf.inverse().transformPoint(0, 0);
            let [x, y] = collView.props.ScreenToLocalTransform().transformPoint(sx, sy);
            topDoc.x = x;
            topDoc.y = y;
        }
    }

    @undoBatch
    @action
    toggleTemplate = (event: React.ChangeEvent<HTMLInputElement>, template: Template): void => {
        if (event.target.checked) {
            this.props.docs.map(d => d.Document["show" + template.Name] = template.Name.toLowerCase());
        } else {
            this.props.docs.map(d => d.Document["show" + template.Name] = "");
        }
    }

    @undoBatch
    @action
    clearTemplates = (event: React.MouseEvent) => {
        Templates.TemplateList.forEach(template => this.props.docs.forEach(d => d.Document["show" + template.Name] = undefined));
        ["backgroundColor", "borderRounding", "width", "height"].forEach(field => this.props.docs.forEach(d => {
            if (d.Document.isTemplateDoc && d.props.DataDoc) {
                d.Document[field] = undefined;
            } else if (d.Document["default" + field[0].toUpperCase() + field.slice(1)] !== undefined) {
                d.Document[field] = Doc.GetProto(d.Document)[field] = undefined;
            }
        }));
    }

    @action
    toggleTemplateActivity = (): void => {
        this._hidden = !this._hidden;
    }

    @undoBatch
    @action
    toggleChrome = (): void => {
        this.props.docs.map(dv => {
            let layout = Doc.Layout(dv.Document);
            layout.chromeStatus = (layout.chromeStatus !== "disabled" ? "disabled" : "enabled");
        });
    }
    onAliasButtonUp = (e: PointerEvent): void => {
        document.removeEventListener("pointermove", this.onAliasButtonMoved);
        document.removeEventListener("pointerup", this.onAliasButtonUp);
        e.stopPropagation();
    }

    onAliasButtonDown = (e: React.PointerEvent): void => {
        this._downx = e.clientX;
        this._downy = e.clientY;
        e.stopPropagation();
        e.preventDefault();
        document.removeEventListener("pointermove", this.onAliasButtonMoved);
        document.addEventListener("pointermove", this.onAliasButtonMoved);
        document.removeEventListener("pointerup", this.onAliasButtonUp);
        document.addEventListener("pointerup", this.onAliasButtonUp);
    }
    onAliasButtonMoved = (e: PointerEvent): void => {
        if (this._dragRef.current !== null && (Math.abs(e.clientX - this._downx) > 4 || Math.abs(e.clientY - this._downy) > 4)) {
            document.removeEventListener("pointermove", this.onAliasButtonMoved);
            document.removeEventListener("pointerup", this.onAliasButtonUp);

            let dragDocView = this.props.docs[0];
            let dragData = new DragManager.DocumentDragData([dragDocView.props.Document]);
            const [left, top] = dragDocView.props.ScreenToLocalTransform().inverse().transformPoint(0, 0);
            dragData.embedDoc = true;
            dragData.dropAction = "alias";
            DragManager.StartDocumentDrag([dragDocView.ContentDiv!], dragData, left, top, {
                offsetX: dragData.offset[0],
                offsetY: dragData.offset[1],
                handlers: {
                    dragComplete: action(emptyFunction),
                },
                hideSource: false
            });
        }
        e.stopPropagation();
    }

    render() {
        let layout = Doc.Layout(this.props.docs[0].Document);
        let templateMenu: Array<JSX.Element> = [];
        this.props.templates.forEach((checked, template) =>
            templateMenu.push(<TemplateToggle key={template.Name} template={template} checked={checked} toggle={this.toggleTemplate} />));
        templateMenu.push(<OtherToggle key={"float"} name={"Float"} checked={this.props.docs[0].Document.z ? true : false} toggle={this.toggleFloat} />);
        templateMenu.push(<OtherToggle key={"custom"} name={"Custom"} checked={StrCast(this.props.docs[0].Document.layoutKey, "layout") !== "layout"} toggle={this.toggleCustom} />);
        templateMenu.push(<OtherToggle key={"chrome"} name={"Chrome"} checked={layout.chromeStatus !== "disabled"} toggle={this.toggleChrome} />);
        return (
            <div className="templating-menu" onPointerDown={this.onAliasButtonDown}>
                <div title="Drag:(create alias). Tap:(modify layout)." className="templating-button" onClick={() => this.toggleTemplateActivity()}>+</div>
                <ul id="template-list" ref={this._dragRef} style={{ display: this._hidden ? "none" : "block" }}>
                    {templateMenu}
                    {<button onClick={this.clearTemplates}>Restore Defaults</button>}
                </ul>
            </div>
        );
    }
}
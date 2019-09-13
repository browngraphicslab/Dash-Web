import { action, observable } from "mobx";
import { observer } from "mobx-react";
import { DocumentType } from "../documents/DocumentTypes";
import { DocumentManager } from "../util/DocumentManager";
import { DragManager } from "../util/DragManager";
import { SelectionManager } from "../util/SelectionManager";
import { undoBatch } from "../util/UndoManager";
import './DocumentDecorations.scss';
import { DocumentView } from "./nodes/DocumentView";
import { Template, Templates } from "./Templates";
import React = require("react");
import { Doc } from "../../new_fields/Doc";
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
class ChromeToggle extends React.Component<{ checked: boolean, toggle: (event: React.ChangeEvent<HTMLInputElement>) => void }> {
    render() {
        return (
            <li className="chromeToggle">
                <input type="checkbox" checked={this.props.checked} onChange={(event) => this.props.toggle(event)} />
                Chrome
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
    dragRef = React.createRef<HTMLUListElement>();

    constructor(props: TemplateMenuProps) {
        super(props);
    }

    toggleCustom = (e: React.MouseEvent): void => {
        this.props.docs.map(dv => {
            if (dv.Document.type !== DocumentType.COL && dv.Document.type !== DocumentType.TEMPLATE) {
                dv.makeCustomViewClicked();
            } else if (dv.Document.nativeLayout) {
                dv.makeNativeViewClicked();
            }
        });
    }

    toggleFloat = (e: React.MouseEvent): void => {
        SelectionManager.DeselectAll();
        let topDocView = this.props.docs[0];
        let topDoc = topDocView.props.Document;
        let xf = topDocView.props.ScreenToLocalTransform();
        let ex = e.clientX;
        let ey = e.clientY;
        undoBatch(action(() => topDoc.z = topDoc.z ? 0 : 1))();
        if (!topDoc.z) {
            setTimeout(() => {
                let newDocView = DocumentManager.Instance.getDocumentView(topDoc);
                if (newDocView) {
                    let de = new DragManager.DocumentDragData([topDoc], [undefined]);
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
            this.props.docs.map(d => Doc.GetProto(d.layoutDoc)["show" + template.Name] = template.Name.toLowerCase());
        } else {
            this.props.docs.map(d => Doc.GetProto(d.layoutDoc)["show" + template.Name] = undefined);
        }
    }

    @undoBatch
    @action
    clearTemplates = (event: React.MouseEvent) => {
        Templates.TemplateList.map(template => this.props.docs.map(d => d.layoutDoc["show" + template.Name] = false));
    }

    @action
    toggleTemplateActivity = (): void => {
        this._hidden = !this._hidden;
    }

    @undoBatch
    @action
    toggleChrome = (): void => {
        this.props.docs.map(dv => dv.layoutDoc.chromeStatus = (dv.layoutDoc.chromeStatus !== "disabled" ? "disabled" : "enabled"));
    }

    render() {
        let templateMenu: Array<JSX.Element> = [];
        this.props.templates.forEach((checked, template) =>
            templateMenu.push(<TemplateToggle key={template.Name} template={template} checked={checked} toggle={this.toggleTemplate} />));
        templateMenu.push(<ChromeToggle key={"chrome"} checked={this.props.docs[0].Document.chromeStatus !== "disabled"} toggle={this.toggleChrome} />);
        return (
            <div className="templating-menu" >
                <div title="Template Options" className="templating-button" onClick={() => this.toggleTemplateActivity()}>+</div>
                <ul id="template-list" ref={this.dragRef} style={{ display: this._hidden ? "none" : "block" }}>
                    {templateMenu}
                    <button onClick={this.toggleCustom}>{this.props.docs[0].Document.nativeLayout ? "Native" : "Custom"}</button>
                    <button onClick={this.toggleFloat}>Float</button>
                    {/* <button onClick={this.clearTemplates}>Clear</button> */}
                </ul>
            </div>
        );
    }
}
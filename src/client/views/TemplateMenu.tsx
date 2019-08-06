import { action, observable } from "mobx";
import { observer } from "mobx-react";
import { Doc } from "../../new_fields/Doc";
import { List } from "../../new_fields/List";
import './DocumentDecorations.scss';
import { DocumentView } from "./nodes/DocumentView";
import { Template } from "./Templates";
import React = require("react");
import { undoBatch } from "../util/UndoManager";
import { DocumentManager } from "../util/DocumentManager";
import { NumCast } from "../../new_fields/Types";
import { DragManager } from "../util/DragManager";
import { SelectionManager } from "../util/SelectionManager";
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
            if (template.Name === "Bullet") {
                let topDocView = this.props.docs[0];
                topDocView.addTemplate(template);
                topDocView.props.Document.subBulletDocs = new List<Doc>(this.props.docs.filter(v => v !== topDocView).map(v => v.props.Document));
            } else {
                this.props.docs.map(d => d.addTemplate(template));
            }
            this.props.templates.set(template, true);
        } else {
            if (template.Name === "Bullet") {
                let topDocView = this.props.docs[0];
                topDocView.removeTemplate(template);
                topDocView.props.Document.subBulletDocs = undefined;
            } else {
                this.props.docs.map(d => d.removeTemplate(template));
            }
            this.props.templates.set(template, false);
        }
    }

    @undoBatch
    @action
    clearTemplates = (event: React.MouseEvent) => {
        this.props.docs.map(d => d.clearTemplates());
        Array.from(this.props.templates.keys()).map(t => this.props.templates.set(t, false));
    }

    @action
    componentWillReceiveProps(nextProps: TemplateMenuProps) {
        // this._templates = nextProps.templates;
    }

    @action
    toggleTemplateActivity = (): void => {
        this._hidden = !this._hidden;
    }

    render() {
        let templateMenu: Array<JSX.Element> = [];
        this.props.templates.forEach((checked, template) =>
            templateMenu.push(<TemplateToggle key={template.Name} template={template} checked={checked} toggle={this.toggleTemplate} />));

        return (
            <div className="templating-menu" >
                <div title="Template Options" className="templating-button" onClick={() => this.toggleTemplateActivity()}>+</div>
                <ul id="template-list" ref={this.dragRef} style={{ display: this._hidden ? "none" : "block" }}>
                    {templateMenu}
                    <button onClick={this.toggleFloat}>Float</button>
                    <button onClick={this.clearTemplates}>Clear</button>
                </ul>
            </div>
        );
    }
}
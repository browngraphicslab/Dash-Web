import { action, observable } from "mobx";
import { observer } from "mobx-react";
import { DragManager } from "../util/DragManager";
import { SelectionManager } from "../util/SelectionManager";
import { undoBatch } from "../util/UndoManager";
import './TemplateMenu.scss';
import { DocumentView } from "./nodes/DocumentView";
import { Template, Templates } from "./Templates";
import React = require("react");
import { Doc } from "../../new_fields/Doc";
import { StrCast } from "../../new_fields/Types";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEdit, faChevronCircleUp } from "@fortawesome/free-solid-svg-icons";
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
    toggleNarrative = (e: React.ChangeEvent<HTMLInputElement>): void => {
        this.props.docs.map(dv => dv.setNarrativeView(e.target.checked));
    }

    toggleFloat = (e: React.ChangeEvent<HTMLInputElement>): void => {
        SelectionManager.DeselectAll();
        const topDocView = this.props.docs[0];
        const ex = e.target.getBoundingClientRect().left;
        const ey = e.target.getBoundingClientRect().top;
        DocumentView.FloatDoc(topDocView, ex, ey);
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
            const layout = Doc.Layout(dv.Document);
            layout._chromeStatus = (layout._chromeStatus !== "disabled" ? "disabled" : "enabled");
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

            const dragDocView = this.props.docs[0];
            const dragData = new DragManager.DocumentDragData([dragDocView.props.Document]);
            const [left, top] = dragDocView.props.ScreenToLocalTransform().inverse().transformPoint(0, 0);
            dragData.embedDoc = true;
            dragData.dropAction = "alias";
            DragManager.StartDocumentDrag([dragDocView.ContentDiv!], dragData, left, top, {
                offsetX: dragData.offset[0],
                offsetY: dragData.offset[1],
                hideSource: false
            });
        }
        e.stopPropagation();
    }

    render() {
        const layout = Doc.Layout(this.props.docs[0].Document);
        const templateMenu: Array<JSX.Element> = [];
        this.props.templates.forEach((checked, template) =>
            templateMenu.push(<TemplateToggle key={template.Name} template={template} checked={checked} toggle={this.toggleTemplate} />));
        templateMenu.push(<OtherToggle key={"float"} name={"Float"} checked={this.props.docs[0].Document.z ? true : false} toggle={this.toggleFloat} />);
        templateMenu.push(<OtherToggle key={"custom"} name={"Custom"} checked={StrCast(this.props.docs[0].Document.layoutKey, "layout") !== "layout"} toggle={this.toggleCustom} />);
        templateMenu.push(<OtherToggle key={"narrative"} name={"Narrative"} checked={StrCast(this.props.docs[0].Document.layoutKey, "layout") === "layout_narrative"} toggle={this.toggleNarrative} />);
        templateMenu.push(<OtherToggle key={"chrome"} name={"Chrome"} checked={layout._chromeStatus !== "disabled"} toggle={this.toggleChrome} />);
        return (
            <div className="templating-button" onPointerDown={this.onAliasButtonDown} title="Drag:(create alias). Tap:(modify layout)." >
                <Flyout anchorPoint={anchorPoints.LEFT_TOP}
                    content={<ul className="template-list" ref={this._dragRef} style={{ display: "block" }}>
                        {templateMenu}
                        {<button onClick={this.clearTemplates}>Restore Defaults</button>}
                    </ul>}>
                    <span className="parentDocumentSelector-button" >
                        <FontAwesomeIcon icon={faEdit} size={"sm"} />
                    </span>
                </Flyout>
            </div>
        );
    }
}
import { action, observable, runInAction, ObservableSet } from "mobx";
import { observer } from "mobx-react";
import { SelectionManager } from "../util/SelectionManager";
import { undoBatch } from "../util/UndoManager";
import './TemplateMenu.scss';
import { DocumentView } from "./nodes/DocumentView";
import { Template, Templates } from "./Templates";
import React = require("react");
import { Doc, DocListCast } from "../../new_fields/Doc";
import { StrCast, Cast } from "../../new_fields/Types";
import { CurrentUserUtils } from "../../server/authentication/models/current_user_utils";
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

    toggleLayout = (e: React.ChangeEvent<HTMLInputElement>, layout: string): void => {
        this.props.docs.map(dv => dv.setCustomView(e.target.checked, layout));
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

    // todo: add brushes to brushMap to save with a style name
    onCustomKeypress = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            runInAction(() => TemplateMenu._addedKeys.add(this._customRef.current!.value));
        }
    }
    componentDidMount() {
        !TemplateMenu._addedKeys && (TemplateMenu._addedKeys = new ObservableSet(["narrative"]));
        Array.from(Object.keys(Doc.GetProto(this.props.docs[0].props.Document))).
            filter(key => key.startsWith("layout_")).
            map(key => runInAction(() => TemplateMenu._addedKeys.add(key.replace("layout_", ""))));
        DocListCast(Cast(CurrentUserUtils.UserDocument.expandingButtons, Doc, null)?.data)?.map(btnDoc => {
            if (StrCast(Cast(btnDoc?.dragFactory, Doc, null)?.title)) {
                runInAction(() => TemplateMenu._addedKeys.add(StrCast(Cast(btnDoc?.dragFactory, Doc, null)?.title)));
            }
        });
    }

    static _addedKeys = new ObservableSet(["narrative"]);
    _customRef = React.createRef<HTMLInputElement>();
    render() {
        const layout = Doc.Layout(this.props.docs[0].Document);
        const templateMenu: Array<JSX.Element> = [];
        this.props.templates.forEach((checked, template) =>
            templateMenu.push(<TemplateToggle key={template.Name} template={template} checked={checked} toggle={this.toggleTemplate} />));
        templateMenu.push(<OtherToggle key={"float"} name={"Float"} checked={this.props.docs[0].Document.z ? true : false} toggle={this.toggleFloat} />);
        templateMenu.push(<OtherToggle key={"chrome"} name={"Chrome"} checked={layout._chromeStatus !== "disabled"} toggle={this.toggleChrome} />);
        TemplateMenu._addedKeys && Array.from(TemplateMenu._addedKeys).map(layout =>
            templateMenu.push(<OtherToggle key={layout} name={layout} checked={StrCast(this.props.docs[0].Document.layoutKey, "layout") === "layout_" + layout} toggle={e => this.toggleLayout(e, layout)} />)
        );
        return <ul className="template-list" style={{ display: "block" }}>
            {templateMenu}
            <input placeholder="+ layout" ref={this._customRef} onKeyPress={this.onCustomKeypress}></input>
        </ul>;
    }
}
import * as React from 'react';
import { observer } from 'mobx-react';
import { observable, action } from 'mobx';
import './ScriptingRepl.scss';
import { Scripting, CompileScript, ts } from '../util/Scripting';
import { DocumentManager } from '../util/DocumentManager';
import { DocumentView } from './nodes/DocumentView';
import { OverlayView } from './OverlayView';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { library } from '@fortawesome/fontawesome-svg-core';
import { faCaretDown, faCaretRight } from '@fortawesome/free-solid-svg-icons';

library.add(faCaretDown);
library.add(faCaretRight);

@observer
export class DocumentIcon extends React.Component<{ view: DocumentView, index: number }> {
    render() {
        this.props.view.props.ScreenToLocalTransform();
        this.props.view.props.Document.width;
        this.props.view.props.Document.height;
        const screenCoords = this.props.view.screenRect();

        return (
            <div className="documentIcon-outerDiv" style={{
                position: "absolute",
                transform: `translate(${screenCoords.left + screenCoords.width / 2}px, ${screenCoords.top}px)`,
            }}>
                <p >${this.props.index}</p>
            </div>
        );
    }
}

@observer
export class DocumentIconContainer extends React.Component {
    render() {
        return DocumentManager.Instance.DocumentViews.map((dv, i) => <DocumentIcon key={i} index={i} view={dv} />);
    }
}

@observer
export class ScriptingObjectDisplay extends React.Component<{ scrollToBottom: () => void, value: { [key: string]: any }, name?: string }> {
    @observable collapsed = true;

    @action
    toggle = () => {
        this.collapsed = !this.collapsed;
        this.props.scrollToBottom();
    }

    render() {
        const val = this.props.value;
        const proto = Object.getPrototypeOf(val);
        const name = (proto && proto.constructor && proto.constructor.name) || String(val);
        const title = this.props.name ? <><b>{this.props.name} : </b>{name}</> : name;
        if (this.collapsed) {
            return (
                <div className="scriptingObject-collapsed">
                    <span onClick={this.toggle} className="scriptingObject-icon scriptingObject-iconCollapsed"><FontAwesomeIcon icon="caret-right" size="sm" /></span>{title} (+{Object.keys(val).length})
                </div>
            );
        } else {
            return (
                <div className="scriptingObject-open">
                    <div>
                        <span onClick={this.toggle} className="scriptingObject-icon"><FontAwesomeIcon icon="caret-down" size="sm" /></span>{title}
                    </div>
                    <div className="scriptingObject-fields">
                        {Object.keys(val).map(key => <ScriptingValueDisplay {...this.props} name={key} />)}
                    </div>
                </div>
            );
        }
    }
}

@observer
export class ScriptingValueDisplay extends React.Component<{ scrollToBottom: () => void, value: any, name?: string }> {
    render() {
        const val = this.props.name ? this.props.value[this.props.name] : this.props.value;
        if (typeof val === "object") {
            return <ScriptingObjectDisplay scrollToBottom={this.props.scrollToBottom} value={val} name={this.props.name} />;
        } else if (typeof val === "function") {
            const name = "[Function]";
            const title = this.props.name ? <><b>{this.props.name} : </b>{name}</> : name;
            return <div className="scriptingObject-leaf">{title}</div>;
        } else {
            const name = String(val);
            const title = this.props.name ? <><b>{this.props.name} : </b>{name}</> : name;
            return <div className="scriptingObject-leaf">{title}</div>;
        }
    }
}

@observer
export class ScriptingRepl extends React.Component {
    @observable private commands: { command: string, result: any }[] = [];

    @observable private commandString: string = "";
    private commandBuffer: string = "";

    @observable private historyIndex: number = -1;

    private commandsRef = React.createRef<HTMLDivElement>();

    private args: any = {};

    getTransformer: ts.TransformerFactory<ts.SourceFile> = context => {
        const knownVars: { [name: string]: number } = {};
        const usedDocuments: number[] = [];
        Scripting.getGlobals().forEach(global => knownVars[global] = 1);
        return root => {
            function visit(node: ts.Node) {
                node = ts.visitEachChild(node, visit, context);

                if (ts.isIdentifier(node)) {
                    const isntPropAccess = !ts.isPropertyAccessExpression(node.parent) || node.parent.expression === node;
                    const isntPropAssign = !ts.isPropertyAssignment(node.parent) || node.parent.name !== node;
                    if (isntPropAccess && isntPropAssign && !(node.text in knownVars) && !(node.text in globalThis)) {
                        const match = node.text.match(/\$([0-9]+)/);
                        if (match) {
                            const m = parseInt(match[1]);
                            usedDocuments.push(m);
                        } else {
                            return ts.createPropertyAccess(ts.createIdentifier("args"), node);
                        }
                    }
                }

                return node;
            }
            return ts.visitNode(root, visit);
        };
    }

    @action
    onKeyDown = (e: React.KeyboardEvent) => {
        let stopProp = true;
        switch (e.key) {
            case "Enter": {
                const docGlobals: { [name: string]: any } = {};
                DocumentManager.Instance.DocumentViews.forEach((dv, i) => docGlobals[`$${i}`] = dv.props.Document);
                const globals = Scripting.makeMutableGlobalsCopy(docGlobals);
                const script = CompileScript(this.commandString, { typecheck: false, addReturn: true, editable: true, params: { args: "any" }, transformer: this.getTransformer, globals });
                if (!script.compiled) {
                    return;
                }
                const result = script.run({ args: this.args });
                if (!result.success) {
                    return;
                }
                this.commands.push({ command: this.commandString, result: result.result });

                this.maybeScrollToBottom();

                this.commandString = "";
                this.commandBuffer = "";
                this.historyIndex = -1;
                break;
            }
            case "ArrowUp": {
                if (this.historyIndex < this.commands.length - 1) {
                    this.historyIndex++;
                    if (this.historyIndex === 0) {
                        this.commandBuffer = this.commandString;
                    }
                    this.commandString = this.commands[this.commands.length - 1 - this.historyIndex].command;
                }
                break;
            }
            case "ArrowDown": {
                if (this.historyIndex >= 0) {
                    this.historyIndex--;
                    if (this.historyIndex === -1) {
                        this.commandString = this.commandBuffer;
                        this.commandBuffer = "";
                    } else {
                        this.commandString = this.commands[this.commands.length - 1 - this.historyIndex].command;
                    }
                }
                break;
            }
            default:
                stopProp = false;
                break;
        }

        if (stopProp) {
            e.stopPropagation();
            e.preventDefault();
        }
    }

    @action
    onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        this.commandString = e.target.value;
    }

    private shouldScroll: boolean = false;
    private maybeScrollToBottom = () => {
        const ele = this.commandsRef.current;
        if (ele && ele.scrollTop === (ele.scrollHeight - ele.offsetHeight)) {
            this.shouldScroll = true;
            this.forceUpdate();
        }
    }

    private scrollToBottom() {
        const ele = this.commandsRef.current;
        ele && ele.scroll({ behavior: "auto", top: ele.scrollHeight });
    }

    componentDidUpdate() {
        if (this.shouldScroll) {
            this.shouldScroll = false;
            this.scrollToBottom();
        }
    }

    overlayDisposer?: () => void;
    onFocus = () => {
        if (this.overlayDisposer) {
            this.overlayDisposer();
        }
        this.overlayDisposer = OverlayView.Instance.addElement(<DocumentIconContainer />, { x: 0, y: 0 });
    }

    onBlur = () => {
        this.overlayDisposer && this.overlayDisposer();
    }

    render() {
        return (
            <div className="scriptingRepl-outerContainer">
                <div className="scriptingRepl-commandsContainer" ref={this.commandsRef}>
                    {this.commands.map(({ command, result }, i) => {
                        return (
                            <div className="scriptingRepl-resultContainer" key={i}>
                                <div className="scriptingRepl-commandString">{command || <br />}</div>
                                <div className="scriptingRepl-commandResult">{<ScriptingValueDisplay scrollToBottom={this.maybeScrollToBottom} value={result} />}</div>
                            </div>
                        );
                    })}
                </div>
                <input
                    className="scriptingRepl-commandInput"
                    onFocus={this.onFocus}
                    onBlur={this.onBlur}
                    value={this.commandString}
                    onChange={this.onChange}
                    onKeyDown={this.onKeyDown}></input>
            </div>
        );
    }
}
import * as React from 'react';
import { observer } from 'mobx-react';
import { observable, action } from 'mobx';
import './ScriptingRepl.scss';
import { Scripting, CompileScript } from '../util/Scripting';

@observer
export class ScriptingRepl extends React.Component {
    @observable private commands: { command: string, result: any }[] = [];

    @observable private commandString: string = "";

    private args: any = {};

    @action
    onKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            e.stopPropagation();

            const script = CompileScript(this.commandString, { typecheck: false, addReturn: true, editable: true, params: { args: "any" } });
            if (!script.compiled) {
                return;
            }
            const result = script.run({ args: this.args });
            if (!result.success) {
                return;
            }
            this.commands.push({ command: this.commandString, result: result.result });

            this.commandString = "";
        }
    }

    @action
    onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        this.commandString = e.target.value;
    }

    render() {
        return (
            <div className="scriptingRepl-outerContainer">
                <div className="scriptingRepl-commandsContainer">
                    {this.commands.map(({ command, result }) => {
                        return (
                            <div className="scriptingRepl-resultContainer">
                                <div className="scriptingRepl-commandString">{command}</div>
                                <div className="scriptingRepl-commandResult">{String(result)}</div>
                            </div>
                        );
                    })}
                </div>
                <input
                    className="scriptingRepl-commandInput"
                    value={this.commandString}
                    onChange={this.onChange}
                    onKeyDown={this.onKeyDown}></input>
            </div>
        );
    }
}
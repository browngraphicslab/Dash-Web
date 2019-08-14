import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { observer } from 'mobx-react';
import { observable, computed } from 'mobx';
import { CompileScript } from '../client/util/Scripting';
import { makeInterface } from '../new_fields/Schema';
import { ObjectField } from '../new_fields/ObjectField';
import { RefField } from '../new_fields/RefField';
import { DocServer } from '../client/DocServer';

@observer
class Repl extends React.Component {
    @observable text: string = "";

    @observable executedCommands: { command: string, result: any }[] = [];

    onChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        this.text = e.target.value;
    }

    onKeyDown = (e: React.KeyboardEvent) => {
        if (!e.ctrlKey && e.key === "Enter") {
            e.preventDefault();
            const script = CompileScript(this.text, {
                addReturn: true, typecheck: false,
                params: { makeInterface: "any" }
            });
            if (!script.compiled) {
                this.executedCommands.push({ command: this.text, result: "Compile Error" });
            } else {
                const result = script.run({ makeInterface });
                if (result.success) {
                    this.executedCommands.push({ command: this.text, result: result.result });
                } else {
                    this.executedCommands.push({ command: this.text, result: result.error.message || result.error });
                }
            }
            this.text = "";
        }
    }

    @computed
    get commands() {
        return this.executedCommands.map(command => {
            return (
                <div style={{ marginTop: "5px" }}>
                    <p>{command.command}</p>
                    {/* <pre>{JSON.stringify(command.result, null, 2)}</pre> */}
                    <pre>{command.result instanceof RefField || command.result instanceof ObjectField ? "object" : String(command.result)}</pre>
                </div>
            );
        });
    }

    render() {
        return (
            <div>
                <div style={{ verticalAlign: "bottom" }}>
                    {this.commands}
                </div>
                <textarea style={{ width: "100%", position: "absolute", bottom: "0px" }} value={this.text} onChange={this.onChange} onKeyDown={this.onKeyDown} />
            </div>
        );
    }
}

(async function () {
    // currently the repl is given system privileges (which allows write on everything)
    DocServer.init(window.location.protocol, window.location.hostname, 4321, "repl", "system");
    ReactDOM.render(<Repl />, document.getElementById("root"));
})();
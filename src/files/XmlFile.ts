import { FileReference, Diagnostic, Callable, ExpressionCall, File } from '../interfaces';
import util from '../util';
import * as fsExtra from 'fs-extra';
import { Program } from '../Program';
import * as path from 'path';
import { CompletionItem, CompletionItemKind } from 'vscode-languageserver';

export class XmlFile {
    constructor(
        public pathAbsolute: string,
        /**
         * The absolute path to the file, relative to the pkg
         */
        public pkgPath: string,
        public program: Program
    ) {
        this.extension = path.extname(pathAbsolute).toLowerCase();
    }

    /**
     * The extension for this file
     */
    public extension: string;

    public scriptImports = [] as FileReference[];

    public diagnostics = [] as Diagnostic[];

    //TODO implement the xml CDATA parsing, which would populate this list
    public callables = [] as Callable[];

    //TODO implement the xml CDATA parsing, which would populate this list
    public expressionCalls = [] as ExpressionCall[];

    public reset() {
        this.wasProcessed = false;
        this.scriptImports = [];
        this.diagnostics = [];
        this.callables = [];
        this.expressionCalls = [];
    }

    /**
     * Indicates if this file was processed by the program yet. 
     */
    public wasProcessed = false;

    public async parse(fileContents?: string) {
        if (this.wasProcessed) {
            throw new Error(`File was already processed. Create a new file instead. ${this.pathAbsolute}`);
        }

        //load from disk if file contents are not provided
        if (typeof fileContents !== 'string') {
            fileContents = (await fsExtra.readFile(this.pathAbsolute)).toString();
        }

        //split the text into lines
        let lines = util.getLines(fileContents);

        //find all script imports
        for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
            let line = lines[lineIndex];
            let scriptMatch = /(.*<\s*script.*uri\s*=\s*")(.*)".*\/>/ig.exec(line)
            if (scriptMatch) {
                let junkBeforeUri = scriptMatch[1];
                let filePath = scriptMatch[2];
                let columnIndexBegin = junkBeforeUri.length;

                this.scriptImports.push({
                    sourceFile: this,
                    text: filePath,
                    lineIndex: lineIndex,
                    columnIndexBegin: columnIndexBegin,
                    columnIndexEnd: columnIndexBegin + filePath.length,
                    pkgPath: util.getPkgPathFromTarget(this.pkgPath, filePath)
                });
            }
        }
        this.wasProcessed = true;
    }

    /**
     * Determines if this xml file has a reference to the specified file (or if it's itself)
     * @param file 
     */
    public doesReferenceFile(file: File) {
        if (file === this) {
            return true;
        }
        for (let scriptImport of this.scriptImports) {
            //if the script imports the file
            if (scriptImport.pkgPath.toLowerCase() === file.pkgPath.toLowerCase()) {
                return true;
            }
        }
        //didn't find any script imports for this file
        return false;
    }

    /**
     * Get all available completions for the specified position
     * @param lineIndex 
     * @param columnIndex 
     */
    public getCompletions(lineIndex: number, columnIndex: number): CompletionItem[] {
        let result = [] as CompletionItem[];
        let scriptImport = this.scriptImports.find((x) => {
            return x.lineIndex === lineIndex &&
                //column between start and end
                columnIndex >= x.columnIndexBegin &&
                columnIndex <= x.columnIndexEnd
        });
        //the position is within a script import. Provide path completions
        if (scriptImport) {
            //get a list of all scripts currently being imported
            let currentImports = this.scriptImports.map(x => x.pkgPath);

            //restrict to only .brs files
            for (let key in this.program.files) {
                let file = this.program.files[key];
                if (
                    //is a brightscript file
                    (file.extension === '.bs' || file.extension === '.brs') &&
                    //not already referenced in this file
                    currentImports.indexOf(file.pkgPath) === -1
                ) {
                    //add the absolute path
                    result.push({
                        label: 'pkg:/' + file.pkgPath.replace('\\', '/'),
                        kind: CompletionItemKind.File
                    });

                    //add the relative path
                    util.getPkgPathFromTarget
                    result.push({
                        label: util.getRelativePath(this.pkgPath, file.pkgPath),
                        kind: CompletionItemKind.File
                    });
                }
            }
        }
        return result;
    }
}